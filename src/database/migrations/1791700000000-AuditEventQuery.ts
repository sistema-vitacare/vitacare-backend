import type { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_PERMISSIONS = ['audit_events:read', 'audit_events:export'];

/**
 * BE-23 (decisoes de Mateus, 2026-11-09): perfil e IP do autor gravados no
 * momento da acao, trilha imutavel (UPDATE e DELETE recusados pelo banco;
 * TRUNCATE dos testes descartaveis nao e afetado), indice para a consulta do
 * master entre organizacoes e consulta/exportacao para o `platform_admin`.
 * Eventos anteriores ficam com perfil e IP nulos.
 */
export class AuditEventQuery1791700000000 implements MigrationInterface {
  name = 'AuditEventQuery1791700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);
    const schema = this.schema(queryRunner);

    await queryRunner.query(`
      ALTER TABLE ${table('audit_events')}
        ADD COLUMN actor_profile_code varchar(32),
        ADD COLUMN ip_address inet,
        ADD CONSTRAINT audit_events_profile_check
          CHECK (actor_type = 'user' OR actor_profile_code IS NULL)
    `);
    await queryRunner.query(
      `CREATE INDEX audit_events_occurred_idx ON ${table('audit_events')} (occurred_at DESC, id DESC)`,
    );
    await queryRunner.query(`
      CREATE FUNCTION ${schema}.audit_events_reject_change() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP
          USING ERRCODE = 'restrict_violation';
      END
      $$
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_events_immutable
        BEFORE UPDATE OR DELETE ON ${table('audit_events')}
        FOR EACH ROW EXECUTE FUNCTION ${schema}.audit_events_reject_change()
    `);

    await queryRunner.query(
      `INSERT INTO ${table('permissions')} (code, name)
       SELECT code, name FROM (VALUES
         ('audit_events:read', 'Consultar auditoria'),
         ('audit_events:export', 'Exportar auditoria')) AS catalog (code, name)
       ON CONFLICT (code) DO UPDATE SET deleted_at = NULL`,
    );
    await queryRunner.query(
      `INSERT INTO ${table('profile_permissions')} (organization_id, profile_id, permission_id)
       SELECT profile.organization_id, profile.id, permission.id
         FROM ${table('access_profiles')} profile
         JOIN ${table('organizations')} organization
           ON organization.id = profile.organization_id
          AND organization.kind = 'platform'
         JOIN ${table('permissions')} permission
           ON permission.code = ANY($1::varchar[])
        WHERE profile.code = 'platform_admin'
       ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`,
      [AUDIT_PERMISSIONS],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);
    const schema = this.schema(queryRunner);

    await queryRunner.query(
      `DELETE FROM ${table('profile_permissions')} grant_row
        USING ${table('permissions')} permission, ${table('access_profiles')} profile
        WHERE permission.id = grant_row.permission_id
          AND profile.id = grant_row.profile_id
          AND permission.code = ANY($1::varchar[])
          AND profile.code = 'platform_admin'`,
      [AUDIT_PERMISSIONS],
    );
    await queryRunner.query(
      `DROP TRIGGER audit_events_immutable ON ${table('audit_events')}`,
    );
    await queryRunner.query(
      `DROP FUNCTION ${schema}.audit_events_reject_change()`,
    );
    await queryRunner.query(`DROP INDEX ${schema}."audit_events_occurred_idx"`);
    await queryRunner.query(`
      ALTER TABLE ${table('audit_events')}
        DROP CONSTRAINT audit_events_profile_check,
        DROP COLUMN ip_address,
        DROP COLUMN actor_profile_code
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
