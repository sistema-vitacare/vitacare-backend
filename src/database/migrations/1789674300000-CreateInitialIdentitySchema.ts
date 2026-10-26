import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Primeira fatia do schema. O catalogo fisico de planos sustenta a FK da
 * organizacao; regras de vigencia e mudanca de plano ficam para outra fatia.
 */
export class CreateInitialIdentitySchema1789674300000 implements MigrationInterface {
  name = 'CreateInitialIdentitySchema1789674300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres') {
      throw new Error('Esta migration exige PostgreSQL.');
    }
    const schemaName = options.schema ?? 'public';
    const schema = `"${schemaName.replace(/"/g, '""')}"`;
    const table = (name: string): string => `${schema}."${name}"`;

    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS citext');

    await queryRunner.query(`
      CREATE TABLE ${table('usage_plans')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        description text,
        user_limit integer NOT NULL,
        patient_limit integer NOT NULL,
        monthly_price numeric(12,2),
        status boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT usage_plans_user_limit_check CHECK (user_limit >= 0),
        CONSTRAINT usage_plans_patient_limit_check CHECK (patient_limit >= 0),
        CONSTRAINT usage_plans_monthly_price_check CHECK (
          monthly_price IS NULL OR monthly_price >= 0
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('organizations')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usage_plan_id uuid NOT NULL,
        trade_name varchar(180) NOT NULL,
        legal_name varchar(180),
        document varchar(32),
        phone varchar(32),
        email citext,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT organizations_usage_plan_fk FOREIGN KEY (usage_plan_id)
          REFERENCES ${table('usage_plans')} (id) ON DELETE RESTRICT,
        CONSTRAINT organizations_status_check CHECK (status IN ('active', 'inactive')),
        CONSTRAINT organizations_deactivation_check CHECK (
          (status = 'inactive') = (deleted_at IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('access_profiles')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        code varchar(64) NOT NULL,
        name varchar(120) NOT NULL,
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT access_profiles_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT access_profiles_org_code_unique UNIQUE (organization_id, code),
        CONSTRAINT access_profiles_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT access_profiles_code_check CHECK (code ~ '^[a-z][a-z0-9_]*$')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('permissions')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(100) NOT NULL,
        name varchar(120) NOT NULL,
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT permissions_code_unique UNIQUE (code),
        CONSTRAINT permissions_code_check CHECK (
          code ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$'
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('profile_permissions')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        profile_id uuid NOT NULL,
        permission_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT profile_permissions_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT profile_permissions_profile_tenant_fk
          FOREIGN KEY (profile_id, organization_id)
          REFERENCES ${table('access_profiles')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT profile_permissions_permission_fk FOREIGN KEY (permission_id)
          REFERENCES ${table('permissions')} (id) ON DELETE RESTRICT,
        CONSTRAINT profile_permissions_pair_unique UNIQUE (profile_id, permission_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('users')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        profile_id uuid NOT NULL,
        name varchar(180) NOT NULL,
        email citext NOT NULL,
        cpf varchar(11) NOT NULL,
        password_hash varchar(255),
        phone varchar(32),
        status varchar(16) NOT NULL DEFAULT 'pending',
        last_access_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT users_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT users_profile_tenant_fk FOREIGN KEY (profile_id, organization_id)
          REFERENCES ${table('access_profiles')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT users_org_email_unique UNIQUE (organization_id, email),
        CONSTRAINT users_org_cpf_unique UNIQUE (organization_id, cpf),
        CONSTRAINT users_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT users_cpf_format_check CHECK (cpf ~ '^[0-9]{11}$'),
        CONSTRAINT users_status_check CHECK (status IN ('pending', 'active', 'inactive')),
        CONSTRAINT users_deactivation_check CHECK (
          (status = 'inactive') = (deleted_at IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE ${table('audit_events')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        actor_type varchar(16) NOT NULL,
        actor_user_id uuid,
        action varchar(80) NOT NULL,
        entity_type varchar(80) NOT NULL,
        entity_id uuid,
        before_values jsonb,
        after_values jsonb,
        request_id varchar(80),
        occurred_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT audit_events_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT audit_events_actor_tenant_fk FOREIGN KEY (actor_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT audit_events_actor_check CHECK (
          (actor_type = 'user' AND actor_user_id IS NOT NULL)
          OR (actor_type = 'system' AND actor_user_id IS NULL)
        ),
        CONSTRAINT audit_events_before_object_check CHECK (
          before_values IS NULL OR jsonb_typeof(before_values) = 'object'
        ),
        CONSTRAINT audit_events_after_object_check CHECK (
          after_values IS NULL OR jsonb_typeof(after_values) = 'object'
        )
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX organizations_document_normalized_unique ON ${table('organizations')} (upper(regexp_replace(document, '[^0-9A-Za-z]', '', 'g'))) WHERE document IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX access_profiles_org_idx ON ${table('access_profiles')} (organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX profile_permissions_org_idx ON ${table('profile_permissions')} (organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX profile_permissions_permission_idx ON ${table('profile_permissions')} (permission_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX users_org_status_idx ON ${table('users')} (organization_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX users_org_profile_idx ON ${table('users')} (organization_id, profile_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX audit_events_org_occurred_idx ON ${table('audit_events')} (organization_id, occurred_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX audit_events_org_actor_occurred_idx ON ${table('audit_events')} (organization_id, actor_user_id, occurred_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX audit_events_org_action_occurred_idx ON ${table('audit_events')} (organization_id, action, occurred_at DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres') {
      throw new Error('Esta migration exige PostgreSQL.');
    }
    const schemaName = options.schema ?? 'public';
    const schema = `"${schemaName.replace(/"/g, '""')}"`;

    await queryRunner.query(`DROP TABLE ${schema}."audit_events"`);
    await queryRunner.query(`DROP TABLE ${schema}."users"`);
    await queryRunner.query(`DROP TABLE ${schema}."profile_permissions"`);
    await queryRunner.query(`DROP TABLE ${schema}."permissions"`);
    await queryRunner.query(`DROP TABLE ${schema}."access_profiles"`);
    await queryRunner.query(`DROP TABLE ${schema}."organizations"`);
    await queryRunner.query(`DROP TABLE ${schema}."usage_plans"`);
  }
}
