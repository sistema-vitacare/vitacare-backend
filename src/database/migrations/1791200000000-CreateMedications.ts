import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-14 (2026-11-05): medicamentos (MER `medicamentos`) e agenda
 * (`lembretes_medicamentos`) com as decisoes de Mateus: dose decimal com
 * unidade (MER `dosagem_mg INT`), via opcional (so no DER), horarios fixos do
 * dia que se repetem a cada N dias, hora local de Brasilia. Cada linha da
 * agenda e um horario valido em `[created_at, deleted_at)`: mudar a agenda
 * encerra as linhas e cria outras, para o disparo (BE-16) nunca usar um
 * horario antigo. Cuidador e familiar passam a consultar medicamentos.
 * Migration nao importa codigo da aplicacao.
 */
const DOSE_UNITS = [
  'mg',
  'mcg',
  'g',
  'ml',
  'iu',
  'drops',
  'tablet',
  'capsule',
  'application',
];

const ROUTES = [
  'oral',
  'sublingual',
  'topical',
  'transdermal',
  'inhalation',
  'nasal',
  'ophthalmic',
  'otic',
  'rectal',
  'vaginal',
  'subcutaneous',
  'intramuscular',
  'intravenous',
  'other',
];

const READ_PERMISSION = 'medications:read';

const READER_PROFILES = ['caregiver', 'family'];

const sqlList = (values: string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

export class CreateMedications1791200000000 implements MigrationInterface {
  name = 'CreateMedications1791200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('medications')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        created_by_user_id uuid NOT NULL,
        name varchar(200) NOT NULL,
        dose_amount numeric(10,3) NOT NULL,
        dose_unit varchar(16) NOT NULL,
        route varchar(24),
        notes varchar(2000),
        reminders_enabled boolean NOT NULL DEFAULT false,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT medications_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT medications_patient_tenant_fk FOREIGN KEY (patient_id, organization_id)
          REFERENCES ${table('patients')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT medications_created_by_tenant_fk FOREIGN KEY (created_by_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT medications_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT medications_name_check CHECK (btrim(name) <> ''),
        CONSTRAINT medications_notes_check CHECK (btrim(notes) <> ''),
        CONSTRAINT medications_dose_amount_check CHECK (dose_amount > 0),
        CONSTRAINT medications_dose_unit_check CHECK (dose_unit IN (${sqlList(DOSE_UNITS)})),
        CONSTRAINT medications_route_check CHECK (route IN (${sqlList(ROUTES)})),
        CONSTRAINT medications_status_check CHECK (status IN ('active', 'inactive')),
        CONSTRAINT medications_deactivation_check CHECK ((status = 'active') = (deleted_at IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX medications_patient_status_idx ON ${table('medications')} (organization_id, patient_id, status)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('medication_reminders')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        medication_id uuid NOT NULL,
        start_date date NOT NULL,
        end_date date,
        interval_days smallint NOT NULL,
        time_of_day time(0) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT medication_reminders_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT medication_reminders_medication_tenant_fk FOREIGN KEY (medication_id, organization_id)
          REFERENCES ${table('medications')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT medication_reminders_period_check CHECK (end_date >= start_date),
        CONSTRAINT medication_reminders_interval_days_check CHECK (interval_days BETWEEN 1 AND 30),
        CONSTRAINT medication_reminders_status_check CHECK (status IN ('active', 'ended')),
        CONSTRAINT medication_reminders_end_check CHECK ((status = 'active') = (deleted_at IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX medication_reminders_active_time_unique ON ${table('medication_reminders')} (medication_id, time_of_day) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX medication_reminders_medication_idx ON ${table('medication_reminders')} (organization_id, medication_id, deleted_at)`,
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
        WHERE profile.code = ANY($2::varchar[])
       ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`,
      [READ_PERMISSION, READER_PROFILES],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `DELETE FROM ${table('profile_permissions')} grant_row
        USING ${table('permissions')} permission, ${table('access_profiles')} profile
        WHERE permission.id = grant_row.permission_id
          AND profile.id = grant_row.profile_id
          AND permission.code = $1
          AND profile.code = ANY($2::varchar[])`,
      [READ_PERMISSION, READER_PROFILES],
    );
    await queryRunner.query(`DROP TABLE ${table('medication_reminders')}`);
    await queryRunner.query(`DROP TABLE ${table('medications')}`);
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
