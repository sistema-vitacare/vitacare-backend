import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-17 (2026-11-06): destinatarios, preferencias, entrega e ciclo do alerta,
 * decididos por Mateus. `alert_notifications` e a relacao "Usuario Recebe
 * Alerta" do DER (o MER nao tem destinatario) e guarda a leitura individual,
 * que substitui a `data_visualizacao` global. `notification_preferences` tem
 * uma chave por origem x canal (padrao ligado) e o opt-in do admin (padrao
 * desligado); sem linha = padroes. `push_subscriptions` sao os navegadores
 * inscritos (Web Push) e `notification_deliveries` cada envio por push ou
 * e-mail, com tentativas e resultado. `alerts:resolve` vai para admin,
 * profissional e cuidador. O `down` falha se ja houver alerta resolvido, de
 * proposito. Migration nao importa codigo da aplicacao.
 */
const RESOLVE_PERMISSION = {
  code: 'alerts:resolve',
  name: 'Resolver alertas',
};

const PREFERENCE_COLUMNS = ['reading', 'absence', 'medication_reminder']
  .flatMap((source) =>
    ['in_app', 'push', 'email'].map(
      (channel) => `${source}_${channel} boolean NOT NULL DEFAULT true,`,
    ),
  )
  .join('\n        ');

export class CreateAlertNotifications1791500000000 implements MigrationInterface {
  name = 'CreateAlertNotifications1791500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      ALTER TABLE ${table('alerts')}
        ADD COLUMN resolved_at timestamptz,
        ADD COLUMN resolved_by_user_id uuid,
        ADD CONSTRAINT alerts_id_org_unique UNIQUE (id, organization_id),
        ADD CONSTRAINT alerts_resolved_by_tenant_fk FOREIGN KEY (resolved_by_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        DROP CONSTRAINT alerts_status_check,
        ADD CONSTRAINT alerts_status_check CHECK (status IN ('open', 'resolved')),
        ADD CONSTRAINT alerts_resolution_check CHECK (
          (status = 'resolved') = (resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL)
          AND (resolved_at IS NULL) = (resolved_by_user_id IS NULL))
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('notification_preferences')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        user_id uuid NOT NULL,
        organization_alerts boolean NOT NULL DEFAULT false,
        ${PREFERENCE_COLUMNS}
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT notification_preferences_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT notification_preferences_user_tenant_fk FOREIGN KEY (user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT notification_preferences_user_unique UNIQUE (user_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('alert_notifications')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        alert_id uuid NOT NULL,
        user_id uuid NOT NULL,
        reason varchar(24) NOT NULL,
        in_app boolean NOT NULL,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT alert_notifications_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT alert_notifications_alert_tenant_fk FOREIGN KEY (alert_id, organization_id)
          REFERENCES ${table('alerts')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alert_notifications_user_tenant_fk FOREIGN KEY (user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alert_notifications_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT alert_notifications_alert_user_unique UNIQUE (alert_id, user_id),
        CONSTRAINT alert_notifications_reason_check CHECK (reason IN ('patient_link', 'organization_admin'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX alert_notifications_inbox_idx ON ${table('alert_notifications')} (organization_id, user_id, created_at DESC, id) WHERE in_app`,
    );
    await queryRunner.query(
      `CREATE INDEX alert_notifications_unread_idx ON ${table('alert_notifications')} (organization_id, user_id) WHERE read_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('push_subscriptions')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        user_id uuid NOT NULL,
        endpoint varchar(1000) NOT NULL,
        p256dh varchar(200) NOT NULL,
        auth varchar(100) NOT NULL,
        last_success_at timestamptz,
        revoked_reason varchar(16),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT push_subscriptions_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT push_subscriptions_user_tenant_fk FOREIGN KEY (user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT push_subscriptions_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT push_subscriptions_revoked_check CHECK ((deleted_at IS NULL) = (revoked_reason IS NULL)),
        CONSTRAINT push_subscriptions_revoked_reason_check CHECK (revoked_reason IN ('user', 'replaced', 'expired'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX push_subscriptions_endpoint_active_unique ON ${table('push_subscriptions')} (endpoint) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX push_subscriptions_user_idx ON ${table('push_subscriptions')} (organization_id, user_id) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('notification_deliveries')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        notification_id uuid NOT NULL,
        channel varchar(8) NOT NULL,
        push_subscription_id uuid,
        status varchar(16) NOT NULL DEFAULT 'pending',
        attempts smallint NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        last_error_code varchar(40),
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT notification_deliveries_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT notification_deliveries_notification_tenant_fk FOREIGN KEY (notification_id, organization_id)
          REFERENCES ${table('alert_notifications')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT notification_deliveries_subscription_tenant_fk FOREIGN KEY (push_subscription_id, organization_id)
          REFERENCES ${table('push_subscriptions')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('push', 'email')),
        CONSTRAINT notification_deliveries_target_check CHECK ((channel = 'push') = (push_subscription_id IS NOT NULL)),
        CONSTRAINT notification_deliveries_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
        CONSTRAINT notification_deliveries_sent_check CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
        CONSTRAINT notification_deliveries_attempts_check CHECK (attempts >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX notification_deliveries_push_unique ON ${table('notification_deliveries')} (notification_id, push_subscription_id) WHERE channel = 'push'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX notification_deliveries_email_unique ON ${table('notification_deliveries')} (notification_id) WHERE channel = 'email'`,
    );
    await queryRunner.query(
      `CREATE INDEX notification_deliveries_due_idx ON ${table('notification_deliveries')} (next_attempt_at) WHERE status = 'pending'`,
    );

    await queryRunner.query(
      `INSERT INTO ${table('permissions')} (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL`,
      [RESOLVE_PERMISSION.code, RESOLVE_PERMISSION.name],
    );
    await queryRunner.query(
      `INSERT INTO ${table('profile_permissions')} (organization_id, profile_id, permission_id)
       SELECT profile.organization_id, profile.id, permission.id
         FROM ${table('access_profiles')} profile
         JOIN ${table('organizations')} organization
           ON organization.id = profile.organization_id
          AND organization.kind = 'tenant'
         JOIN ${table('permissions')} permission
           ON permission.code = $1
        WHERE profile.code IN ('admin', 'professional', 'caregiver')
       ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`,
      [RESOLVE_PERMISSION.code],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `DELETE FROM ${table('profile_permissions')} grant_row
        USING ${table('permissions')} permission
        WHERE permission.id = grant_row.permission_id
          AND permission.code = $1`,
      [RESOLVE_PERMISSION.code],
    );
    await queryRunner.query(
      `DELETE FROM ${table('permissions')} WHERE code = $1`,
      [RESOLVE_PERMISSION.code],
    );
    await queryRunner.query(`DROP TABLE ${table('notification_deliveries')}`);
    await queryRunner.query(`DROP TABLE ${table('push_subscriptions')}`);
    await queryRunner.query(`DROP TABLE ${table('alert_notifications')}`);
    await queryRunner.query(`DROP TABLE ${table('notification_preferences')}`);
    await queryRunner.query(`
      ALTER TABLE ${table('alerts')}
        DROP CONSTRAINT alerts_resolution_check,
        DROP CONSTRAINT alerts_status_check,
        ADD CONSTRAINT alerts_status_check CHECK (status IN ('open')),
        DROP CONSTRAINT alerts_resolved_by_tenant_fk,
        DROP CONSTRAINT alerts_id_org_unique,
        DROP COLUMN resolved_by_user_id,
        DROP COLUMN resolved_at
    `);
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');

    return `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
  }

  private tableName(queryRunner: QueryRunner): (name: string) => string {
    const schema = this.schema(queryRunner);

    return (name: string) => `${schema}."${name}"`;
  }
}
