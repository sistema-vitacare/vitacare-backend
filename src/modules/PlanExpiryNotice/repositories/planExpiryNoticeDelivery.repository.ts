import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import {
  DELIVERY_LEASE_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  retryDelaySeconds,
} from '@/modules/Notification/policies/deliveryRetry.policy';
import type { PlanExpiryMilestone } from '@/modules/Plan/types/plan.types';

export interface ClaimedNoticeDelivery {
  id: string;
  organizationId: string;
  noticeId: string;
  attempts: number;
  email: string;
  milestone: PlanExpiryMilestone;
  termEndsAt: Date;
  organizationName: string;
  planName: string;
}

interface RawClaim extends ClaimedNoticeDelivery {
  skipReason: string | null;
}

/**
 * Reserva ate `$1` e-mails vencidos e reconfere cada um antes do envio:
 * organizacao ativa, termo ainda corrente (renovar, trocar ou aprovar pedido o
 * substitui), aviso ainda valido (o de 7 dias nao sai depois do marco de 1
 * dia; o de 1 dia, depois do fim) e destinatario ainda admin ativo. O que nao
 * passa fica `skipped` com o motivo; o que passa ganha uma tentativa e o prazo
 * da reserva (`$2` s). Mesma politica do BE-17.
 */
const CLAIM = `
  WITH picked AS (
    SELECT d.id, d.notice_id, d.user_id, d.organization_id
      FROM plan_expiry_notice_deliveries d
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
             WHEN term.superseded_at IS NOT NULL OR term.deleted_at IS NOT NULL
               THEN 'TERM_SUPERSEDED'
             WHEN n.valid_until IS NOT NULL AND n.valid_until <= now()
               THEN 'NOTICE_OUTDATED'
             WHEN u.status <> 'active' OR u.deleted_at IS NOT NULL
               OR profile.code <> 'admin'
               THEN 'RECIPIENT_REVOKED'
           END AS skip_reason,
           n.organization_id, n.id AS notice_id, n.milestone,
           n.term_ends_at, u.email, org.trade_name, plan.name AS plan_name
      FROM picked p
      JOIN plan_expiry_notices n
        ON n.id = p.notice_id
       AND n.organization_id = p.organization_id
      JOIN organization_plan_terms term
        ON term.id = n.plan_term_id
       AND term.organization_id = n.organization_id
      JOIN usage_plans plan
        ON plan.id = term.usage_plan_id
      JOIN organizations org
        ON org.id = n.organization_id
      JOIN users u
        ON u.id = p.user_id
       AND u.organization_id = p.organization_id
      JOIN access_profiles profile
        ON profile.id = u.profile_id
       AND profile.organization_id = u.organization_id
  )
  UPDATE plan_expiry_notice_deliveries d
     SET status = CASE WHEN c.skip_reason IS NULL THEN 'pending' ELSE 'skipped' END,
         last_error_code = coalesce(c.skip_reason, d.last_error_code),
         attempts = d.attempts + CASE WHEN c.skip_reason IS NULL THEN 1 ELSE 0 END,
         next_attempt_at = CASE WHEN c.skip_reason IS NULL
                                THEN now() + make_interval(secs => $2)
                                ELSE d.next_attempt_at END,
         updated_at = now()
    FROM checked c
   WHERE d.id = c.id
  RETURNING d.id, d.attempts,
            c.skip_reason AS "skipReason",
            c.organization_id AS "organizationId",
            c.notice_id AS "noticeId",
            c.milestone, c.term_ends_at AS "termEndsAt", c.email,
            c.trade_name AS "organizationName",
            c.plan_name AS "planName"`;

/**
 * E-mails dos avisos de vencimento (BE-28). O estado mora aqui: a fila so
 * agenda as execucoes. Toda escrita confere `status = 'pending'`, para um
 * resultado atrasado nao sobrescrever outro.
 */
@Injectable()
export class PlanExpiryNoticeDeliveryRepository {
  constructor(private readonly dataSource: DataSource) {}

  async claimDue(
    limit: number,
  ): Promise<{ claimed: ClaimedNoticeDelivery[]; skipped: number }> {
    const [rows] = await this.dataSource.manager.query<[RawClaim[], number]>(
      CLAIM,
      [limit, DELIVERY_LEASE_SECONDS],
    );
    const claimed = rows
      .filter((row) => row.skipReason === null)
      .map(({ skipReason: _, ...row }) => row);

    return { claimed, skipped: rows.length - claimed.length };
  }

  async complete(
    delivery: ClaimedNoticeDelivery,
    result: DeliveryResult,
  ): Promise<void> {
    const update = (set: string, parameters: unknown[] = []) =>
      this.dataSource.manager.query(
        `UPDATE plan_expiry_notice_deliveries
            SET ${set}, updated_at = now()
          WHERE id = $1 AND status = 'pending'`,
        [delivery.id, ...parameters],
      );

    switch (result.kind) {
      case 'sent':
        await update(
          "status = 'sent', sent_at = now(), last_error_code = NULL",
        );
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
      case 'expired':
        await update("status = 'failed', last_error_code = $2", [result.code]);
        return;
      case 'disabled':
        await update(
          "status = 'skipped', last_error_code = 'CHANNEL_DISABLED'",
        );
    }
  }

  /** Proxima tentativa pendente (inclui reservas em curso), ou `null`. */
  async nextAttemptAt(): Promise<Date | null> {
    const [row] = await this.dataSource.query<Array<{ at: Date | null }>>(
      `SELECT min(next_attempt_at) AS at
         FROM plan_expiry_notice_deliveries
        WHERE status = 'pending'`,
    );

    return row?.at ?? null;
  }
}
