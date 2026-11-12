import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-28 (2026-11-12): aviso de vencimento do plano por e-mail aos
 * administradores, decidido por Mateus. `plan_expiry_notices` e um aviso por
 * marco (`seven_days`, `one_day`, `expired`) de cada termo de vigencia, unico
 * por termo e marco; `valid_until` diz ate quando ele ainda pode sair.
 * `plan_expiry_notice_deliveries` e o e-mail de cada administrador, com
 * tentativas e resultado, unico por aviso e usuario. O termo ganha a chave
 * composta com a organizacao para as FKs de tenant. Sem retroativo: termos
 * ja vencidos recebem o aviso de vencimento na primeira execucao. Migration
 * nao importa codigo da aplicacao.
 */
export class CreatePlanExpiryNotices1791900000000 implements MigrationInterface {
  name = 'CreatePlanExpiryNotices1791900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `ALTER TABLE ${table('organization_plan_terms')} ADD CONSTRAINT organization_plan_terms_id_org_unique UNIQUE (id, organization_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('plan_expiry_notices')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        plan_term_id uuid NOT NULL,
        milestone varchar(16) NOT NULL,
        term_ends_at timestamptz NOT NULL,
        due_at timestamptz NOT NULL,
        valid_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT plan_expiry_notices_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT plan_expiry_notices_term_milestone_unique UNIQUE (plan_term_id, milestone),
        CONSTRAINT plan_expiry_notices_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT plan_expiry_notices_term_tenant_fk FOREIGN KEY (plan_term_id, organization_id)
          REFERENCES ${table('organization_plan_terms')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT plan_expiry_notices_milestone_check CHECK (milestone IN ('seven_days', 'one_day', 'expired')),
        CONSTRAINT plan_expiry_notices_valid_until_check CHECK ((milestone = 'expired') = (valid_until IS NULL))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('plan_expiry_notice_deliveries')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        notice_id uuid NOT NULL,
        user_id uuid NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending',
        attempts smallint NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        last_error_code varchar(40),
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT plan_expiry_notice_deliveries_notice_user_unique UNIQUE (notice_id, user_id),
        CONSTRAINT plan_expiry_notice_deliveries_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT plan_expiry_notice_deliveries_notice_tenant_fk FOREIGN KEY (notice_id, organization_id)
          REFERENCES ${table('plan_expiry_notices')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT plan_expiry_notice_deliveries_user_tenant_fk FOREIGN KEY (user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT plan_expiry_notice_deliveries_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
        CONSTRAINT plan_expiry_notice_deliveries_sent_check CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
        CONSTRAINT plan_expiry_notice_deliveries_attempts_check CHECK (attempts >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX plan_expiry_notice_deliveries_due_idx ON ${table('plan_expiry_notice_deliveries')} (next_attempt_at) WHERE status = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX organization_plan_terms_expiring_idx ON ${table('organization_plan_terms')} (ends_at) WHERE superseded_at IS NULL AND deleted_at IS NULL AND ends_at IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `DROP INDEX ${this.schema(queryRunner)}.organization_plan_terms_expiring_idx`,
    );
    await queryRunner.query(
      `DROP TABLE ${table('plan_expiry_notice_deliveries')}`,
    );
    await queryRunner.query(`DROP TABLE ${table('plan_expiry_notices')}`);
    await queryRunner.query(
      `ALTER TABLE ${table('organization_plan_terms')} DROP CONSTRAINT organization_plan_terms_id_org_unique`,
    );
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
