import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-12 (2026-11-04): registro de acompanhamento (MER
 * `registros_acompanhamento`, `respostas_formulario` e
 * `itens_resposta_formulario`) com as decisoes de Mateus: um formulario por
 * registro, hora da visita separada do envio e correcao por anulacao com
 * motivo, feita pelo autor ou por quem tem `follow_ups:annul` (profissional e,
 * por heranca, admin). As FKs compostas garantem tenant e que cada item aponta
 * para um campo da versao respondida. Migration nao importa codigo da
 * aplicacao.
 */
const ANNUL_PERMISSION = {
  code: 'follow_ups:annul',
  name: 'Anular registro de acompanhamento',
};

export class CreateFollowUpRecords1791000000000 implements MigrationInterface {
  name = 'CreateFollowUpRecords1791000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_records')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        author_user_id uuid NOT NULL,
        visited_at timestamptz NOT NULL,
        notes varchar(2000),
        status varchar(16) NOT NULL DEFAULT 'valid',
        annulled_by_user_id uuid,
        annulment_reason varchar(500),
        alerts_evaluated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_records_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_records_patient_tenant_fk FOREIGN KEY (patient_id, organization_id)
          REFERENCES ${table('patients')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_records_author_tenant_fk FOREIGN KEY (author_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_records_annulled_by_tenant_fk FOREIGN KEY (annulled_by_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_records_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT follow_up_records_notes_check CHECK (btrim(notes) <> ''),
        CONSTRAINT follow_up_records_status_check CHECK (status IN ('valid', 'annulled')),
        CONSTRAINT follow_up_records_annulment_check CHECK (
          (status = 'valid'
            AND deleted_at IS NULL
            AND annulled_by_user_id IS NULL
            AND annulment_reason IS NULL)
          OR (status = 'annulled'
            AND deleted_at IS NOT NULL
            AND annulled_by_user_id IS NOT NULL
            AND annulment_reason IS NOT NULL
            AND btrim(annulment_reason) <> '')
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX follow_up_records_patient_visit_idx ON ${table('follow_up_records')} (organization_id, patient_id, visited_at DESC, created_at DESC, id)`,
    );
    await queryRunner.query(
      `CREATE INDEX follow_up_records_alerts_pending_idx ON ${table('follow_up_records')} (organization_id, created_at) WHERE alerts_evaluated_at IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('follow_up_form_fields')} ADD CONSTRAINT follow_up_form_fields_id_version_org_unique UNIQUE (id, version_id, organization_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_responses')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        record_id uuid NOT NULL,
        form_id uuid NOT NULL,
        form_version_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_responses_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_responses_record_tenant_fk FOREIGN KEY (record_id, organization_id)
          REFERENCES ${table('follow_up_records')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_responses_version_tenant_fk FOREIGN KEY (form_version_id, form_id, organization_id)
          REFERENCES ${table('follow_up_form_versions')} (id, form_id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_responses_record_unique UNIQUE (record_id),
        CONSTRAINT follow_up_responses_id_version_org_unique UNIQUE (id, form_version_id, organization_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX follow_up_responses_form_idx ON ${table('follow_up_responses')} (organization_id, form_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('follow_up_response_items')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        response_id uuid NOT NULL,
        form_version_id uuid NOT NULL,
        field_id uuid NOT NULL,
        value text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT follow_up_response_items_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_response_items_response_tenant_fk FOREIGN KEY (response_id, form_version_id, organization_id)
          REFERENCES ${table('follow_up_responses')} (id, form_version_id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_response_items_field_tenant_fk FOREIGN KEY (field_id, form_version_id, organization_id)
          REFERENCES ${table('follow_up_form_fields')} (id, version_id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT follow_up_response_items_field_unique UNIQUE (response_id, field_id),
        CONSTRAINT follow_up_response_items_value_check CHECK (btrim(value) <> '')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX follow_up_response_items_field_idx ON ${table('follow_up_response_items')} (field_id)`,
    );

    await queryRunner.query(
      `INSERT INTO ${table('permissions')} (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL`,
      [ANNUL_PERMISSION.code, ANNUL_PERMISSION.name],
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
        WHERE profile.code IN ('professional', 'admin')
       ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`,
      [ANNUL_PERMISSION.code],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `DELETE FROM ${table('profile_permissions')} grant_row
        USING ${table('permissions')} permission
        WHERE permission.id = grant_row.permission_id
          AND permission.code = $1`,
      [ANNUL_PERMISSION.code],
    );
    await queryRunner.query(
      `DELETE FROM ${table('permissions')} WHERE code = $1`,
      [ANNUL_PERMISSION.code],
    );
    await queryRunner.query(`DROP TABLE ${table('follow_up_response_items')}`);
    await queryRunner.query(`DROP TABLE ${table('follow_up_responses')}`);
    await queryRunner.query(
      `ALTER TABLE ${table('follow_up_form_fields')} DROP CONSTRAINT follow_up_form_fields_id_version_org_unique`,
    );
    await queryRunner.query(`DROP TABLE ${table('follow_up_records')}`);
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
