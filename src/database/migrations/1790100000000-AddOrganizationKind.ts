import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organizacao de plataforma: unica, sem plano e sempre ativa. Os usuarios dela
 * sao os administradores master que cadastram e mantem as organizacoes.
 */
export class AddOrganizationKind1790100000000 implements MigrationInterface {
  name = 'AddOrganizationKind1790100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schemaOf(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ADD COLUMN kind varchar(16) NOT NULL DEFAULT 'tenant'`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ADD CONSTRAINT organizations_kind_check CHECK (kind IN ('tenant', 'platform'))`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ALTER COLUMN usage_plan_id DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ADD CONSTRAINT organizations_kind_plan_check CHECK ((kind = 'platform') = (usage_plan_id IS NULL))`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ADD CONSTRAINT organizations_platform_active_check CHECK (kind = 'tenant' OR status = 'active')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX organizations_single_platform_unique ON ${table('organizations')} (kind) WHERE kind = 'platform'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schemaOf(queryRunner);
    const table = (name: string) => `${schema}."${name}"`;

    const platforms = (await queryRunner.query(
      `SELECT id FROM ${table('organizations')} WHERE kind = 'platform'`,
    )) as Array<{ id: string }>;

    if (platforms.length > 0) {
      throw new Error(
        'Reversao recusada: a organizacao de plataforma nao tem plano e nao cabe no schema anterior. Remova-a manualmente antes de reverter.',
      );
    }

    await queryRunner.query(
      `DROP INDEX ${schema}."organizations_single_platform_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} DROP CONSTRAINT organizations_platform_active_check`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} DROP CONSTRAINT organizations_kind_plan_check`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ALTER COLUMN usage_plan_id SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} DROP CONSTRAINT organizations_kind_check`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} DROP COLUMN kind`,
    );
  }

  private schemaOf(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;

    if (options.type !== 'postgres') {
      throw new Error('Esta migration exige PostgreSQL.');
    }

    return `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
  }
}
