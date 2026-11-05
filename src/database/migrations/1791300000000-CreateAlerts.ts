import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-15 (2026-11-05): regras de alerta (MER `regras_alerta`) e alertas
 * (`alertas`) por valor registrado, com as decisoes de Mateus: operadores
 * `gt|gte|lt|lte` sobre um valor de referencia decimal, severidade
 * `critical|warning|info`, regra por campo de formulario com paciente
 * opcional. A regra aponta para o `field_key` (estavel entre versoes) em vez do
 * id do campo de uma versao. O alerta guarda a copia do que disparou; o
 * `UNIQUE (rule_id, response_item_id)` impede alerta repetido. Os registros
 * gravados antes daqui ficam marcados como avaliados: nao havia regra quando
 * foram enviados (o `down` nao desfaz essa marca, inofensiva sem regras).
 * `alerts_evaluation_failed_at` adia a varredura de um registro que falhou.
 * Migration nao importa codigo da aplicacao.
 */
const OPERATORS = ['gt', 'gte', 'lt', 'lte'];

const SEVERITIES = ['critical', 'warning', 'info'];

const sqlList = (values: string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

export class CreateAlerts1791300000000 implements MigrationInterface {
  name = 'CreateAlerts1791300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('alert_rules')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        form_id uuid NOT NULL,
        field_key uuid NOT NULL,
        patient_id uuid,
        created_by_user_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        description varchar(500),
        operator varchar(8) NOT NULL,
        reference_value numeric(12,3) NOT NULL,
        severity varchar(16) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT alert_rules_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT alert_rules_form_tenant_fk FOREIGN KEY (form_id, organization_id)
          REFERENCES ${table('follow_up_forms')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alert_rules_patient_tenant_fk FOREIGN KEY (patient_id, organization_id)
          REFERENCES ${table('patients')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alert_rules_created_by_tenant_fk FOREIGN KEY (created_by_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alert_rules_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT alert_rules_name_check CHECK (btrim(name) <> ''),
        CONSTRAINT alert_rules_description_check CHECK (btrim(description) <> ''),
        CONSTRAINT alert_rules_operator_check CHECK (operator IN (${sqlList(OPERATORS)})),
        CONSTRAINT alert_rules_severity_check CHECK (severity IN (${sqlList(SEVERITIES)})),
        CONSTRAINT alert_rules_status_check CHECK (status IN ('active', 'inactive')),
        CONSTRAINT alert_rules_deactivation_check CHECK ((status = 'active') = (deleted_at IS NULL))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX alert_rules_form_field_idx ON ${table('alert_rules')} (organization_id, form_id, field_key) WHERE status = 'active'`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('follow_up_response_items')} ADD CONSTRAINT follow_up_response_items_id_org_unique UNIQUE (id, organization_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('alerts')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        source varchar(16) NOT NULL,
        rule_id uuid,
        follow_up_record_id uuid,
        response_item_id uuid,
        title varchar(120) NOT NULL,
        message varchar(500) NOT NULL,
        severity varchar(16) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'open',
        field_key uuid,
        field_name varchar(120),
        field_unit varchar(20),
        value text,
        operator varchar(8),
        reference_value numeric(12,3),
        generated_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT alerts_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT alerts_patient_tenant_fk FOREIGN KEY (patient_id, organization_id)
          REFERENCES ${table('patients')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alerts_rule_tenant_fk FOREIGN KEY (rule_id, organization_id)
          REFERENCES ${table('alert_rules')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alerts_record_tenant_fk FOREIGN KEY (follow_up_record_id, organization_id)
          REFERENCES ${table('follow_up_records')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alerts_response_item_tenant_fk FOREIGN KEY (response_item_id, organization_id)
          REFERENCES ${table('follow_up_response_items')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT alerts_rule_item_unique UNIQUE (rule_id, response_item_id),
        CONSTRAINT alerts_source_check CHECK (source IN ('reading')),
        CONSTRAINT alerts_reading_origin_check CHECK (
          source <> 'reading' OR (
            rule_id IS NOT NULL AND follow_up_record_id IS NOT NULL
            AND response_item_id IS NOT NULL AND field_key IS NOT NULL
            AND field_name IS NOT NULL AND value IS NOT NULL
            AND operator IS NOT NULL AND reference_value IS NOT NULL)),
        CONSTRAINT alerts_title_check CHECK (btrim(title) <> ''),
        CONSTRAINT alerts_message_check CHECK (btrim(message) <> ''),
        CONSTRAINT alerts_severity_check CHECK (severity IN (${sqlList(SEVERITIES)})),
        CONSTRAINT alerts_operator_check CHECK (operator IN (${sqlList(OPERATORS)})),
        CONSTRAINT alerts_status_check CHECK (status IN ('open'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX alerts_patient_generated_idx ON ${table('alerts')} (organization_id, patient_id, generated_at DESC, id)`,
    );
    await queryRunner.query(
      `CREATE INDEX alerts_record_idx ON ${table('alerts')} (organization_id, follow_up_record_id)`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('follow_up_records')} ADD COLUMN alerts_evaluation_failed_at timestamptz`,
    );
    await queryRunner.query(
      `UPDATE ${table('follow_up_records')} SET alerts_evaluated_at = now() WHERE alerts_evaluated_at IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`DROP TABLE ${table('alerts')}`);
    await queryRunner.query(
      `ALTER TABLE ${table('follow_up_records')} DROP COLUMN alerts_evaluation_failed_at`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('follow_up_response_items')} DROP CONSTRAINT follow_up_response_items_id_org_unique`,
    );
    await queryRunner.query(`DROP TABLE ${table('alert_rules')}`);
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
