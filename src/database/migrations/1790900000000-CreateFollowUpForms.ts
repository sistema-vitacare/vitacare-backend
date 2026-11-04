import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-11 (2026-11-04): formularios de acompanhamento (MER
 * `formularios_acompanhamento` e `campos_formulario`) com as decisoes de
 * Mateus: versoes publicadas imutaveis (os campos pertencem a versao), formulario
 * aplicavel a organizacao inteira ou a uma lista de pacientes e frequencia
 * esperada opcional. FKs compostas `(id, organization_id)` impedem mistura
 * entre organizacoes. Migration nao importa codigo da aplicacao.
 */
const DEACTIVATE_LABEL = {
  previous: 'Desativar formularios',
  current: 'Desativar e reativar formularios',
};

export class CreateFollowUpForms1790900000000 implements MigrationInterface {
  name = 'CreateFollowUpForms1790900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_forms')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        description varchar(1000),
        tracking_type varchar(80),
        status varchar(16) NOT NULL DEFAULT 'draft',
        audience varchar(16) NOT NULL DEFAULT 'organization',
        frequency_interval smallint,
        frequency_unit varchar(8),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_forms_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_forms_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT follow_up_forms_name_check CHECK (btrim(name) <> ''),
        CONSTRAINT follow_up_forms_status_check CHECK (status IN ('draft', 'active', 'inactive')),
        CONSTRAINT follow_up_forms_audience_check CHECK (audience IN ('organization', 'patients')),
        CONSTRAINT follow_up_forms_frequency_check CHECK (
          (frequency_interval IS NULL) = (frequency_unit IS NULL)
          AND (frequency_interval IS NULL OR frequency_interval BETWEEN 1 AND 365)
          AND (frequency_unit IS NULL OR frequency_unit IN ('hours', 'days', 'weeks'))
        ),
        CONSTRAINT follow_up_forms_deactivation_check CHECK (
          (status = 'inactive') = (deleted_at IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX follow_up_forms_org_status_name_idx ON ${table('follow_up_forms')} (organization_id, status, name)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_form_versions')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        form_id uuid NOT NULL,
        version_number integer,
        status varchar(16) NOT NULL,
        published_at timestamptz,
        published_by_user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_form_versions_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_form_versions_form_tenant_fk FOREIGN KEY (form_id, organization_id)
          REFERENCES ${table('follow_up_forms')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_form_versions_publisher_tenant_fk FOREIGN KEY (published_by_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_form_versions_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT follow_up_form_versions_id_form_org_unique UNIQUE (id, form_id, organization_id),
        CONSTRAINT follow_up_form_versions_number_check CHECK (version_number >= 1),
        CONSTRAINT follow_up_form_versions_status_check CHECK (
          (status = 'draft'
            AND version_number IS NULL
            AND published_at IS NULL
            AND published_by_user_id IS NULL)
          OR (status = 'published'
            AND version_number IS NOT NULL
            AND published_at IS NOT NULL
            AND published_by_user_id IS NOT NULL
            AND deleted_at IS NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX follow_up_form_versions_number_unique ON ${table('follow_up_form_versions')} (form_id, version_number) WHERE version_number IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX follow_up_form_versions_single_draft_unique ON ${table('follow_up_form_versions')} (form_id) WHERE status = 'draft' AND deleted_at IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_form_fields')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        form_id uuid NOT NULL,
        version_id uuid NOT NULL,
        field_key uuid NOT NULL,
        name varchar(120) NOT NULL,
        field_type varchar(24) NOT NULL,
        required boolean NOT NULL,
        active boolean NOT NULL,
        position integer NOT NULL,
        section varchar(60),
        unit varchar(20),
        decimal_places smallint,
        scale_min integer,
        scale_max integer,
        options jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_form_fields_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_form_fields_form_tenant_fk FOREIGN KEY (form_id, organization_id)
          REFERENCES ${table('follow_up_forms')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_form_fields_version_tenant_fk FOREIGN KEY (version_id, form_id, organization_id)
          REFERENCES ${table('follow_up_form_versions')} (id, form_id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_form_fields_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT follow_up_form_fields_version_key_unique UNIQUE (version_id, field_key),
        CONSTRAINT follow_up_form_fields_version_position_unique UNIQUE (version_id, position),
        CONSTRAINT follow_up_form_fields_name_check CHECK (btrim(name) <> ''),
        CONSTRAINT follow_up_form_fields_position_check CHECK (position >= 0),
        CONSTRAINT follow_up_form_fields_field_type_check CHECK (
          field_type IN ('number', 'scale', 'boolean', 'text', 'single_choice', 'multiple_choice')
        ),
        CONSTRAINT follow_up_form_fields_requirement_check CHECK (NOT (required AND NOT active)),
        CONSTRAINT follow_up_form_fields_decimal_places_check CHECK (decimal_places BETWEEN 0 AND 3),
        CONSTRAINT follow_up_form_fields_type_config_check CHECK (
          (field_type = 'number'
            AND decimal_places IS NOT NULL
            AND scale_min IS NULL AND scale_max IS NULL AND options IS NULL)
          OR (field_type = 'scale'
            AND scale_min IS NOT NULL AND scale_max IS NOT NULL
            AND scale_min BETWEEN -1000 AND 1000
            AND scale_max BETWEEN -1000 AND 1000
            AND scale_min < scale_max
            AND unit IS NULL AND decimal_places IS NULL AND options IS NULL)
          OR (field_type IN ('boolean', 'text')
            AND unit IS NULL AND decimal_places IS NULL
            AND scale_min IS NULL AND scale_max IS NULL AND options IS NULL)
          OR (field_type IN ('single_choice', 'multiple_choice')
            AND options IS NOT NULL
            AND jsonb_typeof(options) = 'array'
            AND jsonb_array_length(options) BETWEEN 2 AND 50
            AND unit IS NULL AND decimal_places IS NULL
            AND scale_min IS NULL AND scale_max IS NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX follow_up_form_fields_version_name_unique ON ${table('follow_up_form_fields')} (version_id, lower(btrim(name)))`,
    );
    await queryRunner.query(
      `CREATE INDEX follow_up_form_fields_form_key_idx ON ${table('follow_up_form_fields')} (form_id, field_key)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_form_patients')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        form_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_form_patients_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_form_patients_form_tenant_fk FOREIGN KEY (form_id, organization_id)
          REFERENCES ${table('follow_up_forms')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_form_patients_patient_tenant_fk FOREIGN KEY (patient_id, organization_id)
          REFERENCES ${table('patients')} (id, organization_id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX follow_up_form_patients_active_unique ON ${table('follow_up_form_patients')} (form_id, patient_id) WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX follow_up_form_patients_org_patient_idx ON ${table('follow_up_form_patients')} (organization_id, patient_id) WHERE deleted_at IS NULL`,
    );

    await queryRunner.query(
      `UPDATE ${table('permissions')} SET name = $1 WHERE code = 'forms:deactivate'`,
      [DEACTIVATE_LABEL.current],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `UPDATE ${table('permissions')} SET name = $1 WHERE code = 'forms:deactivate'`,
      [DEACTIVATE_LABEL.previous],
    );
    await queryRunner.query(`DROP TABLE ${table('follow_up_form_patients')}`);
    await queryRunner.query(`DROP TABLE ${table('follow_up_form_fields')}`);
    await queryRunner.query(`DROP TABLE ${table('follow_up_form_versions')}`);
    await queryRunner.query(`DROP TABLE ${table('follow_up_forms')}`);
  }

  private tableName(queryRunner: QueryRunner): (name: string) => string {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;

    return (name: string) => `${schema}."${name}"`;
  }
}
