import type { EntityManager } from 'typeorm';

import { ALERT_SOURCES } from '@/modules/Alert/types/alert.types';
import { AUTHORIZED_LINK_JOIN } from '@/modules/PatientAccess/repositories/patientAccess.query';

import {
  type NotificationChannel,
  PREFERENCE_COLUMNS,
} from '../types/notification.types';

/** Chave da origem `c.source` no canal, com o padrao ligado sem linha `np`. */
const preferenceOf = (channel: NotificationChannel) =>
  `CASE c.source ${ALERT_SOURCES.map(
    (source) =>
      `WHEN '${source}' THEN coalesce(np.${PREFERENCE_COLUMNS[source][channel]}, true)`,
  ).join(' ')} END`;

/**
 * Destinatarios dos alertas `$2` da organizacao `$1`, na transacao que os
 * gravou (UC13 passo 3), se a organizacao esta ativa: vinculos vigentes autorizados do paciente e admins
 * ativos com opt-in, um por usuario com o vinculo a frente. Cria a
 * notificacao para quem tem algum canal ligado na origem e as entregas
 * pendentes de push (uma por inscricao ativa) e e-mail. Repetir nao duplica.
 */
const FAN_OUT = `
  WITH new_alerts AS (
    SELECT a.id, a.organization_id, a.patient_id, a.source
      FROM alerts a
      JOIN organizations o
        ON o.id = a.organization_id
       AND o.status = 'active'
     WHERE a.organization_id = $1
       AND a.id = ANY($2::uuid[])
  ),
  candidates AS (
    SELECT na.id AS alert_id, na.source, link.user_id,
           'patient_link' AS reason, 0 AS priority
      FROM new_alerts na
      JOIN user_patients link
        ON link.organization_id = na.organization_id
       AND link.patient_id = na.patient_id
       AND link.deleted_at IS NULL
    ${AUTHORIZED_LINK_JOIN}
    UNION ALL
    SELECT na.id, na.source, u.id, 'organization_admin', 1
      FROM new_alerts na
      JOIN users u
        ON u.organization_id = na.organization_id
       AND u.status = 'active'
      JOIN access_profiles ap
        ON ap.id = u.profile_id
       AND ap.organization_id = u.organization_id
       AND ap.code = 'admin'
      JOIN notification_preferences opt
        ON opt.user_id = u.id
       AND opt.organization_id = u.organization_id
       AND opt.organization_alerts
       AND opt.deleted_at IS NULL
  ),
  recipients AS (
    SELECT DISTINCT ON (c.alert_id, c.user_id)
           c.alert_id, c.user_id, c.reason,
           ${preferenceOf('in_app')} AS in_app,
           ${preferenceOf('push')} AS push,
           ${preferenceOf('email')} AS email
      FROM candidates c
      LEFT JOIN notification_preferences np
        ON np.user_id = c.user_id
       AND np.organization_id = $1
       AND np.deleted_at IS NULL
     ORDER BY c.alert_id, c.user_id, c.priority
  ),
  inserted AS (
    INSERT INTO alert_notifications
      (organization_id, alert_id, user_id, reason, in_app)
    SELECT $1, r.alert_id, r.user_id, r.reason, r.in_app
      FROM recipients r
     WHERE r.in_app OR r.push OR r.email
    ON CONFLICT (alert_id, user_id) DO NOTHING
    RETURNING id, alert_id, user_id
  ),
  push_deliveries AS (
    INSERT INTO notification_deliveries
      (organization_id, notification_id, channel, push_subscription_id)
    SELECT $1, i.id, 'push', s.id
      FROM inserted i
      JOIN recipients r
        ON r.alert_id = i.alert_id
       AND r.user_id = i.user_id
       AND r.push
      JOIN push_subscriptions s
        ON s.organization_id = $1
       AND s.user_id = i.user_id
       AND s.deleted_at IS NULL
    RETURNING 1
  ),
  email_deliveries AS (
    INSERT INTO notification_deliveries
      (organization_id, notification_id, channel)
    SELECT $1, i.id, 'email'
      FROM inserted i
      JOIN recipients r
        ON r.alert_id = i.alert_id
       AND r.user_id = i.user_id
       AND r.email
    RETURNING 1
  )
  SELECT count(*)::int AS created FROM inserted`;

export const insertAlertNotifications = async (
  manager: EntityManager,
  organizationId: string,
  alertIds: string[],
): Promise<number> => {
  if (alertIds.length === 0) return 0;

  const [{ created }] = await manager.query<Array<{ created: number }>>(
    FAN_OUT,
    [organizationId, alertIds],
  );

  return created;
};
