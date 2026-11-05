import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import { AddOrganizationKind1790100000000 } from '@/database/migrations/1790100000000-AddOrganizationKind';
import { AddTemporaryPasswordExpiry1790200000000 } from '@/database/migrations/1790200000000-AddTemporaryPasswordExpiry';
import { SyncTenantAccessProfiles1790300000000 } from '@/database/migrations/1790300000000-SyncTenantAccessProfiles';
import { AddUserPendingCheck1790400000000 } from '@/database/migrations/1790400000000-AddUserPendingCheck';
import { AddPlanTermsAndChangeRequests1790500000000 } from '@/database/migrations/1790500000000-AddPlanTermsAndChangeRequests';
import { ApplyPlanCatalogRules1790600000000 } from '@/database/migrations/1790600000000-ApplyPlanCatalogRules';
import { CreatePatients1790700000000 } from '@/database/migrations/1790700000000-CreatePatients';
import { AddPatientCareLinks1790800000000 } from '@/database/migrations/1790800000000-AddPatientCareLinks';
import { CreateFollowUpForms1790900000000 } from '@/database/migrations/1790900000000-CreateFollowUpForms';
import { CreateFollowUpRecords1791000000000 } from '@/database/migrations/1791000000000-CreateFollowUpRecords';
import { CreateFollowUpAttachments1791100000000 } from '@/database/migrations/1791100000000-CreateFollowUpAttachments';
import { CreateMedications1791200000000 } from '@/database/migrations/1791200000000-CreateMedications';
import { CreateAlerts1791300000000 } from '@/database/migrations/1791300000000-CreateAlerts';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const PREVIOUS_MIGRATIONS = [
  CreateInitialIdentitySchema1789674300000,
  CreateAuthSchema1790000000000,
  AddOrganizationKind1790100000000,
  AddTemporaryPasswordExpiry1790200000000,
  SyncTenantAccessProfiles1790300000000,
  AddUserPendingCheck1790400000000,
  AddPlanTermsAndChangeRequests1790500000000,
  ApplyPlanCatalogRules1790600000000,
  CreatePatients1790700000000,
  AddPatientCareLinks1790800000000,
  CreateFollowUpForms1790900000000,
  CreateFollowUpRecords1791000000000,
  CreateFollowUpAttachments1791100000000,
  CreateMedications1791200000000,
];

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const dataSourceWith = (migrations: Array<new () => unknown>) =>
  new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
    migrations: migrations as never,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
  });

/** Constraint violada por um INSERT/UPDATE, ou `null` se passou. */
const violation = async (
  dataSource: DataSource,
  sql: string,
  parameters: unknown[],
): Promise<string | null> => {
  const runner = dataSource.createQueryRunner();

  await runner.startTransaction();

  try {
    await runner.query(sql, parameters);

    return null;
  } catch (error) {
    return (error as { constraint?: string }).constraint ?? 'sem constraint';
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
};

interface Tenant {
  id: string;
  user: string;
  patient: string;
  form: string;
  fieldKey: string;
  record: string;
  item: string;
  rule: string;
}

describeWithDatabase('schema de alertas em PostgreSQL descartavel', () => {
  let dataSource: DataSource;
  const org: Record<'A' | 'B', Tenant> = {} as never;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const insertRule = (
    tenant: Tenant,
    columns: Record<string, unknown> = {},
  ) => {
    const row = {
      organization_id: tenant.id,
      form_id: tenant.form,
      field_key: tenant.fieldKey,
      created_by_user_id: tenant.user,
      name: 'Regra',
      operator: 'gt',
      reference_value: 180,
      severity: 'warning',
      ...columns,
    };
    const names = Object.keys(row);

    return violation(
      dataSource,
      `INSERT INTO alert_rules (${names.join(', ')})
       VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  const insertAlert = (
    tenant: Tenant,
    columns: Record<string, unknown> = {},
  ) => {
    const row = {
      organization_id: tenant.id,
      patient_id: tenant.patient,
      source: 'reading',
      rule_id: tenant.rule,
      follow_up_record_id: tenant.record,
      response_item_id: tenant.item,
      title: 'Regra',
      message: 'Glicemia: 250 (maior que 180).',
      severity: 'warning',
      field_key: tenant.fieldKey,
      field_name: 'Glicemia',
      value: '250',
      operator: 'gt',
      reference_value: 180,
      ...columns,
    };
    const names = Object.keys(row);

    return violation(
      dataSource,
      `INSERT INTO alerts (${names.join(', ')})
       VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  beforeAll(async () => {
    dataSource = dataSourceWith(PREVIOUS_MIGRATIONS);
    await dataSource.initialize();

    if (
      (await scalar(
        "SELECT to_regclass('public.organizations')::text AS value",
      )) !== null
    ) {
      throw new Error('O banco de teste ja contem a tabela organizations.');
    }

    await dataSource.runMigrations();

    const plan = (await scalar(
      "SELECT id AS value FROM usage_plans WHERE code = 'basic'",
    ))!;

    for (const key of ['A', 'B'] as const) {
      const id = (await scalar(
        `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
         VALUES ($1, $1, $1, $2) RETURNING id AS value`,
        [`schema-alertas-${key.toLowerCase()}`, plan],
      ))!;

      await dataSource.query(
        `INSERT INTO access_profiles (organization_id, code, name)
         VALUES ($1, 'caregiver', 'caregiver')`,
        [id],
      );

      const user = (await scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
         SELECT $1, id, 'Cuidador', $2, $3, 'active', false
           FROM access_profiles WHERE organization_id = $1
         RETURNING id AS value`,
        [id, `c@${key}.test`, key === 'A' ? '52998224725' : '11144477735'],
      ))!;
      const patient = (await scalar(
        `INSERT INTO patients (organization_id, name, birth_date)
         VALUES ($1, 'Paciente', '1950-01-01') RETURNING id AS value`,
        [id],
      ))!;
      const form = (await scalar(
        `INSERT INTO follow_up_forms (organization_id, name, status)
         VALUES ($1, 'Formulario', 'active') RETURNING id AS value`,
        [id],
      ))!;
      const version = (await scalar(
        `INSERT INTO follow_up_form_versions
           (organization_id, form_id, version_number, status, published_at, published_by_user_id)
         VALUES ($1, $2, 1, 'published', now(), $3) RETURNING id AS value`,
        [id, form, user],
      ))!;
      const fieldKey = (await scalar(
        'SELECT gen_random_uuid()::text AS value',
      ))!;
      const field = (await scalar(
        `INSERT INTO follow_up_form_fields
           (organization_id, form_id, version_id, field_key, name, field_type,
            required, active, position, decimal_places)
         VALUES ($1, $2, $3, $4, 'Glicemia', 'number', true, true, 0, 0)
         RETURNING id AS value`,
        [id, form, version, fieldKey],
      ))!;
      const record = (await scalar(
        `INSERT INTO follow_up_records (organization_id, patient_id, author_user_id, visited_at)
         VALUES ($1, $2, $3, now()) RETURNING id AS value`,
        [id, patient, user],
      ))!;
      const response = (await scalar(
        `INSERT INTO follow_up_responses (organization_id, record_id, form_id, form_version_id)
         VALUES ($1, $2, $3, $4) RETURNING id AS value`,
        [id, record, form, version],
      ))!;
      const item = (await scalar(
        `INSERT INTO follow_up_response_items
           (organization_id, response_id, form_version_id, field_id, value)
         VALUES ($1, $2, $3, $4, '250') RETURNING id AS value`,
        [id, response, version, field],
      ))!;

      org[key] = { id, user, patient, form, fieldKey, record, item, rule: '' };
    }

    await dataSource.destroy();

    dataSource = dataSourceWith([
      ...PREVIOUS_MIGRATIONS,
      CreateAlerts1791300000000,
    ]);
    await dataSource.initialize();
    expect(await dataSource.runMigrations()).toHaveLength(1);

    for (const key of ['A', 'B'] as const) {
      org[key].rule = (await scalar(
        `INSERT INTO alert_rules
           (organization_id, form_id, field_key, created_by_user_id, name,
            operator, reference_value, severity)
         VALUES ($1, $2, $3, $4, 'Regra', 'gt', 180, 'warning')
         RETURNING id AS value`,
        [org[key].id, org[key].form, org[key].fieldKey, org[key].user],
      ))!;
    }
  }, 120000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(
      'TRUNCATE alerts, alert_rules, follow_up_response_items, follow_up_responses, follow_up_records, follow_up_form_fields, follow_up_form_versions, follow_up_forms, patients, audit_events, users, profile_permissions, permissions, access_profiles, organizations, usage_plans CASCADE',
    );

    for (let index = 0; index <= PREVIOUS_MIGRATIONS.length; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  it('marca como avaliados os registros gravados antes das regras', async () => {
    expect(
      await scalar(
        'SELECT count(*)::text AS value FROM follow_up_records WHERE alerts_evaluated_at IS NULL',
      ),
    ).toBe('0');
  });

  it('regra aceita os quatro operadores, tres severidades e paciente opcional', async () => {
    for (const operator of ['gt', 'gte', 'lt', 'lte']) {
      expect(await insertRule(org.A, { operator })).toBeNull();
    }
    for (const severity of ['critical', 'warning', 'info']) {
      expect(await insertRule(org.A, { severity })).toBeNull();
    }
    expect(await insertRule(org.A, { patient_id: org.A.patient })).toBeNull();
    expect(await insertRule(org.A, { reference_value: '-0.125' })).toBeNull();
  });

  it.each([
    [{ operator: 'eq' }, 'alert_rules_operator_check'],
    [{ severity: 'high' }, 'alert_rules_severity_check'],
    [{ name: '  ' }, 'alert_rules_name_check'],
    [{ description: ' ' }, 'alert_rules_description_check'],
    [{ status: 'inactive' }, 'alert_rules_deactivation_check'],
    [{ deleted_at: new Date() }, 'alert_rules_deactivation_check'],
    [{ status: 'deleted', deleted_at: new Date() }, 'alert_rules_status_check'],
  ])('regra recusa %o', async (columns, constraint) => {
    expect(await insertRule(org.A, columns)).toBe(constraint);
  });

  it('regra nao aponta para formulario, paciente ou autor de outra organizacao', async () => {
    expect(await insertRule(org.A, { form_id: org.B.form })).toBe(
      'alert_rules_form_tenant_fk',
    );
    expect(await insertRule(org.A, { patient_id: org.B.patient })).toBe(
      'alert_rules_patient_tenant_fk',
    );
    expect(await insertRule(org.A, { created_by_user_id: org.B.user })).toBe(
      'alert_rules_created_by_tenant_fk',
    );
  });

  it('alerta de leitura exige toda a origem e a copia do disparo', async () => {
    expect(await insertAlert(org.A)).toBeNull();

    for (const column of [
      'rule_id',
      'follow_up_record_id',
      'response_item_id',
      'field_key',
      'field_name',
      'value',
      'operator',
      'reference_value',
    ]) {
      expect(await insertAlert(org.A, { [column]: null })).toBe(
        'alerts_reading_origin_check',
      );
    }
  });

  it.each([
    [{ source: 'absence' }, 'alerts_source_check'],
    [{ status: 'resolved' }, 'alerts_status_check'],
    [{ severity: 'high' }, 'alerts_severity_check'],
    [{ operator: 'eq' }, 'alerts_operator_check'],
    [{ title: ' ' }, 'alerts_title_check'],
    [{ message: ' ' }, 'alerts_message_check'],
  ])('alerta recusa %o', async (columns, constraint) => {
    expect(await insertAlert(org.A, columns)).toBe(constraint);
  });

  it('alerta nao cruza organizacoes em nenhuma origem', async () => {
    expect(await insertAlert(org.A, { patient_id: org.B.patient })).toBe(
      'alerts_patient_tenant_fk',
    );
    expect(await insertAlert(org.A, { rule_id: org.B.rule })).toBe(
      'alerts_rule_tenant_fk',
    );
    expect(
      await insertAlert(org.A, { follow_up_record_id: org.B.record }),
    ).toBe('alerts_record_tenant_fk');
    expect(await insertAlert(org.A, { response_item_id: org.B.item })).toBe(
      'alerts_response_item_tenant_fk',
    );
  });

  it('a mesma regra nao gera dois alertas para o mesmo item', async () => {
    await dataSource.query(
      `INSERT INTO alerts
         (organization_id, patient_id, source, rule_id, follow_up_record_id,
          response_item_id, title, message, severity, field_key, field_name,
          value, operator, reference_value)
       VALUES ($1, $2, 'reading', $3, $4, $5, 'Regra', 'Mensagem', 'warning',
               $6, 'Glicemia', '250', 'gt', 180)`,
      [
        org.B.id,
        org.B.patient,
        org.B.rule,
        org.B.record,
        org.B.item,
        org.B.fieldKey,
      ],
    );

    expect(await insertAlert(org.B)).toBe('alerts_rule_item_unique');
  });

  it('down remove as tabelas e a chave nova dos itens; up recria', async () => {
    await dataSource.query('TRUNCATE alerts, alert_rules');
    await dataSource.undoLastMigration();

    expect(
      await scalar("SELECT to_regclass('public.alerts')::text AS value"),
    ).toBeNull();
    expect(
      await scalar("SELECT to_regclass('public.alert_rules')::text AS value"),
    ).toBeNull();
    expect(
      await scalar(
        `SELECT count(*)::text AS value FROM pg_constraint
          WHERE conname = 'follow_up_response_items_id_org_unique'`,
      ),
    ).toBe('0');
    expect(
      await scalar(
        `SELECT count(*)::text AS value FROM information_schema.columns
          WHERE table_name = 'follow_up_records'
            AND column_name = 'alerts_evaluation_failed_at'`,
      ),
    ).toBe('0');

    expect(await dataSource.runMigrations()).toHaveLength(1);
    expect(
      await scalar("SELECT to_regclass('public.alerts')::text AS value"),
    ).toBe('alerts');
  });
});
