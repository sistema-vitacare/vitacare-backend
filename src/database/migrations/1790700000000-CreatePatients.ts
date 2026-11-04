import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-09 (2026-11-04): pacientes (MER `pacientes` + Figura 35, decidido por
 * Mateus) e o vinculo `usuarios_pacientes` so com o profissional responsavel.
 * As FKs compostas `(id, organization_id)` impedem vinculo entre organizacoes.
 * Migration nao importa codigo da aplicacao: textos ficam aqui.
 */
const DEACTIVATE_LABEL = {
  previous: 'Inativar pacientes',
  current: 'Inativar e reativar pacientes',
};

export class CreatePatients1790700000000 implements MigrationInterface {
  name = 'CreatePatients1790700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('patients')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        name varchar(180) NOT NULL,
        birth_date date NOT NULL,
        sex varchar(16),
        cpf varchar(11),
        phone varchar(32),
        email citext,
        zip_code varchar(8),
        street varchar(180),
        address_number varchar(20),
        address_complement varchar(120),
        district varchar(120),
        city varchar(120),
        state varchar(2),
        main_condition varchar(180),
        secondary_conditions text[] NOT NULL DEFAULT '{}',
        health_plan varchar(180),
        notes text,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT patients_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT patients_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT patients_name_check CHECK (btrim(name) <> ''),
        CONSTRAINT patients_sex_check CHECK (sex IN ('female', 'male', 'other')),
        CONSTRAINT patients_cpf_format_check CHECK (cpf ~ '^[0-9]{11}$'),
        CONSTRAINT patients_zip_code_format_check CHECK (zip_code ~ '^[0-9]{8}$'),
        CONSTRAINT patients_state_format_check CHECK (state ~ '^[A-Z]{2}$'),
        CONSTRAINT patients_status_check CHECK (status IN ('active', 'inactive')),
        CONSTRAINT patients_deactivation_check CHECK (
          (status = 'inactive') = (deleted_at IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX patients_org_cpf_unique ON ${table('patients')} (organization_id, cpf) WHERE cpf IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX patients_org_status_name_idx ON ${table('patients')} (organization_id, status, name)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('user_patients')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        user_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        role varchar(40) NOT NULL,
        link_type varchar(40),
        note varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT user_patients_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT user_patients_user_tenant_fk FOREIGN KEY (user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT user_patients_patient_tenant_fk FOREIGN KEY (patient_id, organization_id)
          REFERENCES ${table('patients')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT user_patients_role_check CHECK (role IN ('responsible_professional'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX user_patients_single_responsible_unique ON ${table('user_patients')} (patient_id) WHERE role = 'responsible_professional' AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX user_patients_org_user_idx ON ${table('user_patients')} (organization_id, user_id) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(
      `UPDATE ${table('permissions')} SET name = $1 WHERE code = 'patients:deactivate'`,
      [DEACTIVATE_LABEL.current],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `UPDATE ${table('permissions')} SET name = $1 WHERE code = 'patients:deactivate'`,
      [DEACTIVATE_LABEL.previous],
    );
    await queryRunner.query(`DROP TABLE ${table('user_patients')}`);
    await queryRunner.query(`DROP TABLE ${table('patients')}`);
  }

  private tableName(queryRunner: QueryRunner): (name: string) => string {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;

    return (name: string) => `${schema}."${name}"`;
  }
}
