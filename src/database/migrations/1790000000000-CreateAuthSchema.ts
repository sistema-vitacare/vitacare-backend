import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSchema1790000000000 implements MigrationInterface {
  name = 'CreateAuthSchema1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ADD COLUMN code varchar(50)`,
    );
    await queryRunner.query(
      `UPDATE ${table('organizations')} SET code = 'org-' || replace(id::text, '-', '') WHERE code IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ALTER COLUMN code SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ADD CONSTRAINT organizations_code_unique UNIQUE (code)`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} ADD CONSTRAINT organizations_code_check CHECK (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('users')} ADD COLUMN must_change_password boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('users')} ADD COLUMN password_changed_at timestamptz`,
    );
    await queryRunner.query(`
      CREATE TABLE ${table('auth_sessions')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, user_id uuid NOT NULL,
        token_hash char(64) NOT NULL, type varchar(24) NOT NULL, expires_at timestamptz NOT NULL,
        last_activity_at timestamptz NOT NULL, revoked_at timestamptz, revoked_reason varchar(40),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
        CONSTRAINT auth_sessions_token_hash_unique UNIQUE (token_hash),
        CONSTRAINT auth_sessions_user_tenant_fk FOREIGN KEY (user_id, organization_id) REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT auth_sessions_type_check CHECK (type IN ('normal', 'password_change')),
        CONSTRAINT auth_sessions_revocation_check CHECK ((revoked_at IS NULL AND revoked_reason IS NULL) OR revoked_at IS NOT NULL)
      )`);
    await queryRunner.query(`
      CREATE TABLE ${table('password_reset_tokens')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, user_id uuid NOT NULL,
        token_hash char(64) NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz, revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
        CONSTRAINT password_reset_tokens_token_hash_unique UNIQUE (token_hash),
        CONSTRAINT password_reset_tokens_user_tenant_fk FOREIGN KEY (user_id, organization_id) REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT
      )`);
    await queryRunner.query(
      `CREATE INDEX auth_sessions_user_org_idx ON ${table('auth_sessions')} (organization_id, user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX auth_sessions_active_idx ON ${table('auth_sessions')} (expires_at) WHERE revoked_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX password_reset_tokens_user_org_idx ON ${table('password_reset_tokens')} (organization_id, user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX password_reset_tokens_active_idx ON ${table('password_reset_tokens')} (expires_at) WHERE consumed_at IS NULL AND revoked_at IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;
    await queryRunner.query(`DROP TABLE ${table('password_reset_tokens')}`);
    await queryRunner.query(`DROP TABLE ${table('auth_sessions')}`);
    await queryRunner.query(
      `ALTER TABLE ${table('users')} DROP COLUMN password_changed_at`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('users')} DROP COLUMN must_change_password`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} DROP CONSTRAINT organizations_code_check`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} DROP CONSTRAINT organizations_code_unique`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('organizations')} DROP COLUMN code`,
    );
  }
}
