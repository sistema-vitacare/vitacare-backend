import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { PATIENT_SCOPE_WHERE } from '@/modules/Patient/repositories/patientScope.query';

import {
  type ChannelPreferences,
  type InboxScope,
  type ListNotificationsFilter,
  type NotificationActor,
  type NotificationChannel,
  type NotificationPreferences,
  type NotificationPreferencesRow,
  type NotificationRow,
  PREFERENCE_COLUMNS,
  PREFERENCE_SOURCES,
  type PreferenceSourceKey,
  type PushSubscriptionInput,
} from '../types/notification.types';

/**
 * Notificacoes do usuario `$4` em pacientes do alcance `$1`..`$3` (alias
 * `n`): a revogacao do vinculo esconde tambem as antigas.
 */
const INBOX_FROM = `
    FROM alert_notifications n
    JOIN alerts a
      ON a.id = n.alert_id
     AND a.organization_id = n.organization_id
    JOIN patients p
      ON p.id = a.patient_id
     AND p.organization_id = a.organization_id
  ${PATIENT_SCOPE_WHERE}
     AND n.user_id = $4`;

const INBOX_SELECT = `
  SELECT n.id, n.reason, n.read_at AS "readAt", n.created_at AS "createdAt",
         a.id AS "alertId", p.id AS "patientId", p.name AS "patientName",
         a.source, a.severity, a.status, a.title, a.message,
         a.generated_at AS "generatedAt"
  ${INBOX_FROM}`;

type RawNotification = Pick<
  NotificationRow,
  'id' | 'reason' | 'readAt' | 'createdAt'
> &
  Omit<NotificationRow['alert'], 'id' | 'patient'> & {
    alertId: string;
    patientId: string;
    patientName: string;
  };

const toRow = (raw: RawNotification): NotificationRow => ({
  id: raw.id,
  alert: {
    id: raw.alertId,
    patient: { id: raw.patientId, name: raw.patientName },
    source: raw.source,
    severity: raw.severity,
    status: raw.status,
    title: raw.title,
    message: raw.message,
    generatedAt: raw.generatedAt,
  },
  reason: raw.reason,
  readAt: raw.readAt,
  createdAt: raw.createdAt,
});

const CHANNEL_KEYS: Record<keyof ChannelPreferences, NotificationChannel> = {
  inApp: 'in_app',
  push: 'push',
  email: 'email',
};

const SOURCE_KEYS = Object.keys(PREFERENCE_SOURCES) as PreferenceSourceKey[];
const CHANNEL_NAMES = Object.keys(CHANNEL_KEYS) as Array<
  keyof ChannelPreferences
>;

/** As nove colunas origem x canal, na ordem fixa de `SOURCE_KEYS`. */
const PREFERENCE_CELLS = SOURCE_KEYS.flatMap((source) =>
  CHANNEL_NAMES.map((channel) => ({
    source,
    channel,
    column:
      PREFERENCE_COLUMNS[PREFERENCE_SOURCES[source]][CHANNEL_KEYS[channel]],
  })),
);

const DEFAULT_PREFERENCES: NotificationPreferences = {
  organizationAlerts: false,
  ...(Object.fromEntries(
    SOURCE_KEYS.map((source) => [
      source,
      { inApp: true, push: true, email: true },
    ]),
  ) as Record<PreferenceSourceKey, ChannelPreferences>),
};

const fromColumns = (
  raw: Record<string, unknown>,
): NotificationPreferencesRow => {
  const preferences = {
    organizationAlerts: raw.organization_alerts as boolean,
    updatedAt: raw.updated_at as Date,
  } as NotificationPreferencesRow;

  for (const { source, channel, column } of PREFERENCE_CELLS) {
    preferences[source] = {
      ...preferences[source],
      [channel]: raw[column] as boolean,
    };
  }

  return preferences;
};

/** Chaves alteradas, como `organizationAlerts` ou `absence.push`. */
const changedKeys = (
  before: NotificationPreferences,
  after: NotificationPreferences,
): string[] => [
  ...(before.organizationAlerts === after.organizationAlerts
    ? []
    : ['organizationAlerts']),
  ...PREFERENCE_CELLS.filter(
    ({ source, channel }) => before[source][channel] !== after[source][channel],
  ).map(({ source, channel }) => `${source}.${channel}`),
];

/**
 * Caixa, leitura, preferencias e inscricoes de push do proprio usuario
 * (BE-17). Tudo e do usuario da sessao: id de notificacao ou `endpoint` de
 * outro usuario se comporta como inexistente.
 */
@Injectable()
export class NotificationRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    scope: InboxScope,
    filter: ListNotificationsFilter,
  ): Promise<{ items: NotificationRow[]; total: number }> {
    try {
      const where = `
          AND n.in_app
          AND ($5::boolean IS NULL OR (n.read_at IS NULL) = $5)
          AND ($6::uuid IS NULL OR a.patient_id = $6)`;
      const parameters = [
        ...this.scopeParameters(scope),
        filter.unread ?? null,
        filter.patientId ?? null,
      ];
      const manager = this.dataSource.manager;
      const [rows, [{ total }]] = await Promise.all([
        manager.query<RawNotification[]>(
          `${INBOX_SELECT} ${where}
            ORDER BY n.created_at DESC, n.id
            LIMIT $7 OFFSET $8`,
          [...parameters, filter.take, filter.skip],
        ),
        manager.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total ${INBOX_FROM} ${where}`,
          parameters,
        ),
      ]);

      return { items: rows.map(toRow), total };
    } catch (error) {
      throw translatePgError(error, 'alert_notifications');
    }
  }

  async countUnread(scope: InboxScope): Promise<number> {
    try {
      const [{ unread }] = await this.dataSource.manager.query<
        Array<{ unread: number }>
      >(
        `SELECT count(*)::int AS unread ${INBOX_FROM}
            AND n.in_app
            AND n.read_at IS NULL`,
        this.scopeParameters(scope),
      );

      return unread;
    } catch (error) {
      throw translatePgError(error, 'alert_notifications');
    }
  }

  /** Mantem a primeira leitura; `null` = nao e do usuario ou fora do alcance. */
  async markRead(
    scope: InboxScope,
    notificationId: string,
  ): Promise<NotificationRow | null> {
    try {
      const manager = this.dataSource.manager;
      const parameters = [...this.scopeParameters(scope), notificationId];
      const [updated] = await manager.query<[unknown[], number]>(
        `UPDATE alert_notifications n
            SET read_at = coalesce(n.read_at, now()),
                updated_at = now()
           FROM alerts a
           JOIN patients p
             ON p.id = a.patient_id
            AND p.organization_id = a.organization_id
         ${PATIENT_SCOPE_WHERE}
            AND a.id = n.alert_id
            AND a.organization_id = n.organization_id
            AND n.user_id = $4
            AND n.id = $5
         RETURNING n.id`,
        parameters,
      );

      if (updated.length === 0) return null;

      const [row] = await manager.query<RawNotification[]>(
        `${INBOX_SELECT} AND n.id = $5`,
        parameters,
      );

      return toRow(row);
    } catch (error) {
      throw translatePgError(error, 'alert_notifications');
    }
  }

  /** Todas as nao lidas do usuario no alcance, ou so as de um paciente. */
  async markAllRead(
    scope: InboxScope,
    patientId: string | null,
  ): Promise<number> {
    try {
      const [, updated] = await this.dataSource.manager.query<
        [unknown[], number]
      >(
        `UPDATE alert_notifications n
            SET read_at = now(),
                updated_at = now()
           FROM alerts a
           JOIN patients p
             ON p.id = a.patient_id
            AND p.organization_id = a.organization_id
         ${PATIENT_SCOPE_WHERE}
            AND a.id = n.alert_id
            AND a.organization_id = n.organization_id
            AND n.user_id = $4
            AND n.read_at IS NULL
            AND ($5::uuid IS NULL OR a.patient_id = $5)`,
        [...this.scopeParameters(scope), patientId],
      );

      return updated;
    } catch (error) {
      throw translatePgError(error, 'alert_notifications');
    }
  }

  async getPreferences(
    organizationId: string,
    userId: string,
  ): Promise<NotificationPreferencesRow> {
    try {
      return await this.readPreferences(
        this.dataSource.manager,
        organizationId,
        userId,
      );
    } catch (error) {
      throw translatePgError(error, 'notification_preferences');
    }
  }

  /** Substitui a matriz e audita as chaves que mudaram. */
  async savePreferences(
    actor: NotificationActor,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferencesRow> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const before = await this.readPreferences(
          manager,
          actor.organizationId,
          actor.userId,
          true,
        );
        const columns = PREFERENCE_CELLS.map(({ column }) => column);
        const values = PREFERENCE_CELLS.map(
          ({ source, channel }) => preferences[source][channel],
        );
        const [raw] = await manager.query<Array<Record<string, unknown>>>(
          `INSERT INTO notification_preferences
             (organization_id, user_id, organization_alerts, ${columns.join(', ')})
           VALUES ($1, $2, $3, ${columns.map((_, index) => `$${index + 4}`).join(', ')})
           ON CONFLICT (user_id) DO UPDATE
              SET organization_alerts = EXCLUDED.organization_alerts,
                  ${columns.map((column) => `${column} = EXCLUDED.${column}`).join(',\n                  ')},
                  deleted_at = NULL,
                  updated_at = now()
           RETURNING *`,
          [
            actor.organizationId,
            actor.userId,
            preferences.organizationAlerts,
            ...values,
          ],
        );
        const changed = changedKeys(before, preferences);

        if (changed.length > 0) {
          await insertAuditEvent(manager, {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            action: 'notification_preferences.updated',
            entityType: 'notification_preferences',
            entityId: raw.id as string,
            afterValues: { changed },
            requestId: actor.requestId,
          });
        }

        return fromColumns(raw);
      });
    } catch (error) {
      throw translatePgError(error, 'notification_preferences');
    }
  }

  /**
   * Registra o navegador para o usuario. O mesmo `endpoint` ativo de outro
   * usuario (navegador compartilhado) e revogado como `replaced`; repetir o
   * registro atualiza as chaves sem criar outra linha.
   */
  async registerPushSubscription(
    actor: NotificationActor,
    input: PushSubscriptionInput,
  ): Promise<{ id: string; createdAt: Date }> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const [replaced] = await manager.query<
          [Array<{ id: string; organizationId: string }>, number]
        >(
          `UPDATE push_subscriptions
              SET deleted_at = now(), revoked_reason = 'replaced', updated_at = now()
            WHERE endpoint = $1
              AND deleted_at IS NULL
              AND NOT (organization_id = $2 AND user_id = $3)
           RETURNING id, organization_id AS "organizationId"`,
          [input.endpoint, actor.organizationId, actor.userId],
        );

        for (const previous of replaced) {
          await insertAuditEvent(manager, {
            organizationId: previous.organizationId,
            actorUserId: null,
            action: 'push_subscription.revoked',
            entityType: 'push_subscription',
            entityId: previous.id,
            afterValues: { reason: 'replaced' },
            requestId: actor.requestId,
          });
        }

        const [row] = await manager.query<
          Array<{ id: string; createdAt: Date; inserted: boolean }>
        >(
          `INSERT INTO push_subscriptions
             (organization_id, user_id, endpoint, p256dh, auth)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (endpoint) WHERE deleted_at IS NULL DO UPDATE
              SET p256dh = EXCLUDED.p256dh,
                  auth = EXCLUDED.auth,
                  updated_at = now()
           RETURNING id, created_at AS "createdAt", (xmax = 0) AS inserted`,
          [
            actor.organizationId,
            actor.userId,
            input.endpoint,
            input.p256dh,
            input.auth,
          ],
        );

        if (row.inserted) {
          await this.auditSubscription(manager, actor, row.id, 'created');
        }

        return { id: row.id, createdAt: row.createdAt };
      });
    } catch (error) {
      throw translatePgError(error, 'push_subscriptions');
    }
  }

  /** `false` = nenhuma inscricao ativa deste usuario com o `endpoint`. */
  async revokePushSubscription(
    actor: NotificationActor,
    endpoint: string,
  ): Promise<boolean> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const [revoked] = await manager.query<[Array<{ id: string }>, number]>(
          `UPDATE push_subscriptions
              SET deleted_at = now(), revoked_reason = 'user', updated_at = now()
            WHERE endpoint = $1
              AND organization_id = $2
              AND user_id = $3
              AND deleted_at IS NULL
           RETURNING id`,
          [endpoint, actor.organizationId, actor.userId],
        );

        for (const { id } of revoked) {
          await this.auditSubscription(manager, actor, id, 'revoked', 'user');
        }

        return revoked.length > 0;
      });
    } catch (error) {
      throw translatePgError(error, 'push_subscriptions');
    }
  }

  private scopeParameters(scope: InboxScope): unknown[] {
    return [
      scope.organizationId,
      scope.viewerUserId,
      scope.viewerLinkRoles,
      scope.userId,
    ];
  }

  private async readPreferences(
    manager: EntityManager,
    organizationId: string,
    userId: string,
    lock = false,
  ): Promise<NotificationPreferencesRow> {
    const [raw] = await manager.query<Array<Record<string, unknown>>>(
      `SELECT *
         FROM notification_preferences
        WHERE organization_id = $1
          AND user_id = $2
          AND deleted_at IS NULL
        ${lock ? 'FOR UPDATE' : ''}`,
      [organizationId, userId],
    );

    return raw ? fromColumns(raw) : { ...DEFAULT_PREFERENCES, updatedAt: null };
  }

  /** Sem `endpoint`: ele identifica o navegador. */
  private auditSubscription(
    manager: EntityManager,
    actor: NotificationActor,
    subscriptionId: string,
    action: 'created' | 'revoked',
    reason?: 'user',
  ): Promise<void> {
    return insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: `push_subscription.${action}`,
      entityType: 'push_subscription',
      entityId: subscriptionId,
      afterValues: reason ? { reason } : null,
      requestId: actor.requestId,
    });
  }
}
