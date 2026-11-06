import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type {
  AlertSeverity,
  AlertSource,
} from '@/modules/Alert/types/alert.types';
import { ALERT_SOURCES } from '@/modules/Alert/types/alert.types';
import { AUTHORIZED_LINK_JOIN } from '@/modules/PatientAccess/repositories/patientAccess.query';

import type { DeliveryResult } from '../channels/deliveryResult.type';
import type { PushTarget } from '../channels/pushSender';
import {
  DELIVERY_LEASE_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  retryDelaySeconds,
} from '../policies/deliveryRetry.policy';
import {
  type DeliveryChannel,
  PREFERENCE_COLUMNS,
} from '../types/notification.types';

export interface ClaimedDelivery {
  id: string;
  organizationId: string;
  notificationId: string;
  alertId: string;
  channel: DeliveryChannel;
  attempts: number;
  email: string;
  subscription: (PushTarget & { id: string }) | null;
  source: AlertSource;
  severity: AlertSeverity;
  patientName: string;
}

interface RawClaim extends Omit<ClaimedDelivery, 'subscription'> {
  skipReason: string | null;
  subscriptionId: string | null;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
}

/** Chave da origem `a.source` no canal `p.channel`; sem linha `np`, ligada. */
const PREFERENCE_ON = `CASE a.source ${ALERT_SOURCES.map(
  (source) =>
    `WHEN '${source}' THEN CASE p.channel
       WHEN 'push' THEN coalesce(np.${PREFERENCE_COLUMNS[source].push}, true)
       ELSE coalesce(np.${PREFERENCE_COLUMNS[source].email}, true) END`,
).join(' ')} END`;

/**
 * Reserva ate `$1` entregas vencidas e reconfere cada uma antes do envio:
 * organizacao ativa, alerta ainda aberto, destinatario ativo com vinculo autorizado ou admin com
 * opt-in, preferencia do canal ligada e inscricao de push ativa. A que nao
 * passa fica `skipped` com o motivo; a que passa ganha uma tentativa e o prazo
 * da reserva (`$2` s), e sai para o envio fora da transacao.
 */
const CLAIM = `
  WITH picked AS (
    SELECT d.id, d.channel, d.push_subscription_id, d.notification_id
      FROM notification_deliveries d
     WHERE d.status = 'pending'
       AND d.next_attempt_at <= now()
     ORDER BY d.next_attempt_at, d.id
     LIMIT $1
       FOR UPDATE SKIP LOCKED
  ),
  checked AS (
    SELECT p.id,
           CASE
             WHEN org.status <> 'active' THEN 'ORGANIZATION_INACTIVE'
             WHEN a.status = 'resolved' THEN 'ALERT_RESOLVED'
             WHEN owner.status <> 'active'
               OR NOT (
                 EXISTS (
                   SELECT 1
                     FROM user_patients link
                   ${AUTHORIZED_LINK_JOIN}
                    WHERE link.organization_id = n.organization_id
                      AND link.patient_id = a.patient_id
                      AND link.user_id = n.user_id
                      AND link.deleted_at IS NULL)
                 OR (owner_profile.code = 'admin'
                     AND coalesce(np.organization_alerts, false)))
               THEN 'RECIPIENT_REVOKED'
             WHEN NOT (${PREFERENCE_ON}) THEN 'PREFERENCE_DISABLED'
             WHEN p.channel = 'push' AND s.deleted_at IS NOT NULL
               THEN 'PUSH_SUBSCRIPTION_REVOKED'
           END AS skip_reason,
           n.organization_id, n.id AS notification_id, a.id AS alert_id,
           owner.email, a.source, a.severity, pt.name AS patient_name,
           s.id AS subscription_id, s.endpoint, s.p256dh, s.auth
      FROM picked p
      JOIN alert_notifications n
        ON n.id = p.notification_id
      JOIN organizations org
        ON org.id = n.organization_id
      JOIN alerts a
        ON a.id = n.alert_id
       AND a.organization_id = n.organization_id
      JOIN patients pt
        ON pt.id = a.patient_id
       AND pt.organization_id = a.organization_id
      JOIN users owner
        ON owner.id = n.user_id
       AND owner.organization_id = n.organization_id
      JOIN access_profiles owner_profile
        ON owner_profile.id = owner.profile_id
       AND owner_profile.organization_id = owner.organization_id
      LEFT JOIN notification_preferences np
        ON np.user_id = n.user_id
       AND np.organization_id = n.organization_id
       AND np.deleted_at IS NULL
      LEFT JOIN push_subscriptions s
        ON s.id = p.push_subscription_id
       AND s.organization_id = n.organization_id
  )
  UPDATE notification_deliveries d
     SET status = CASE WHEN c.skip_reason IS NULL THEN 'pending' ELSE 'skipped' END,
         last_error_code = coalesce(c.skip_reason, d.last_error_code),
         attempts = d.attempts + CASE WHEN c.skip_reason IS NULL THEN 1 ELSE 0 END,
         next_attempt_at = CASE WHEN c.skip_reason IS NULL
                                THEN now() + make_interval(secs => $2)
                                ELSE d.next_attempt_at END,
         updated_at = now()
    FROM checked c
   WHERE d.id = c.id
  RETURNING d.id, d.channel, d.attempts,
            c.skip_reason AS "skipReason",
            c.organization_id AS "organizationId",
            c.notification_id AS "notificationId",
            c.alert_id AS "alertId",
            c.email, c.source, c.severity,
            c.patient_name AS "patientName",
            c.subscription_id AS "subscriptionId",
            c.endpoint, c.p256dh, c.auth`;

/**
 * Entregas de push e e-mail (BE-17). O estado mora aqui: a fila so agenda a
 * varredura. Toda escrita confere `status = 'pending'`, para um resultado
 * atrasado nao sobrescrever outro.
 */
@Injectable()
export class NotificationDeliveryRepository {
  constructor(private readonly dataSource: DataSource) {}

  async claimDue(
    limit: number,
  ): Promise<{ claimed: ClaimedDelivery[]; skipped: number }> {
    const [rows] = await this.dataSource.manager.query<[RawClaim[], number]>(
      CLAIM,
      [limit, DELIVERY_LEASE_SECONDS],
    );
    const claimed = rows.filter((row) => row.skipReason === null);

    return {
      skipped: rows.length - claimed.length,
      claimed: claimed.map(
        ({
          subscriptionId,
          endpoint,
          p256dh,
          auth,
          skipReason: _,
          ...row
        }) => ({
          ...row,
          subscription:
            subscriptionId === null
              ? null
              : {
                  id: subscriptionId,
                  endpoint: endpoint!,
                  p256dh: p256dh!,
                  auth: auth!,
                },
        }),
      ),
    };
  }

  async complete(
    delivery: ClaimedDelivery,
    result: DeliveryResult,
  ): Promise<void> {
    const update = (set: string, parameters: unknown[] = []) =>
      this.dataSource.manager.query(
        `UPDATE notification_deliveries
            SET ${set}, updated_at = now()
          WHERE id = $1 AND status = 'pending'`,
        [delivery.id, ...parameters],
      );

    switch (result.kind) {
      case 'sent':
        await update(
          "status = 'sent', sent_at = now(), last_error_code = NULL",
        );
        if (delivery.subscription) {
          await this.dataSource.manager.query(
            'UPDATE push_subscriptions SET last_success_at = now(), updated_at = now() WHERE id = $1',
            [delivery.subscription.id],
          );
        }
        return;
      case 'retry':
        if (delivery.attempts < MAX_DELIVERY_ATTEMPTS) {
          await update(
            'last_error_code = $2, next_attempt_at = now() + make_interval(secs => $3)',
            [result.code, retryDelaySeconds(delivery.attempts)],
          );
          return;
        }
        await update("status = 'failed', last_error_code = $2", [result.code]);
        return;
      case 'failed':
        await update("status = 'failed', last_error_code = $2", [result.code]);
        return;
      case 'expired':
        await update("status = 'failed', last_error_code = $2", [result.code]);
        if (delivery.subscription) {
          await this.dataSource.manager.query(
            `UPDATE push_subscriptions
                SET deleted_at = now(), revoked_reason = 'expired', updated_at = now()
              WHERE id = $1 AND deleted_at IS NULL`,
            [delivery.subscription.id],
          );
        }
        return;
      case 'disabled':
        await update(
          "status = 'skipped', last_error_code = 'CHANNEL_DISABLED'",
        );
    }
  }
}
