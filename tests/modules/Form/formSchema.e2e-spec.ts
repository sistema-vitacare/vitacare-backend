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
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const MIGRATIONS = [
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
];

const FORM_TABLES = [
  'follow_up_forms',
  'follow_up_form_versions',
  'follow_up_form_fields',
  'follow_up_form_patients',
];

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

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

interface FieldValues {
  name?: string;
  fieldType?: string;
  required?: boolean;
  active?: boolean;
  position?: number;
  unit?: string | null;
  decimalPlaces?: number | null;
  scaleMin?: number | null;
  scaleMax?: number | null;
  options?: string | null;
  fieldKey?: string;
}

describeWithDatabase(
  'schema de formularios de acompanhamento em PostgreSQL',
  () => {
    let dataSource: DataSource;
    let migrated = 0;
    let orgA: string;
    let orgB: string;
    let userA: string;
    let patientA: string;
    let patientB: string;
    let formA: string;
    let draftA: string;
    let publishedA: string;
    let formB: string;
    let versionB: string;

    const scalar = async (sql: string, parameters: unknown[] = []) => {
      const rows: Array<{ value: string | null }> = await dataSource.query(
        sql,
        parameters,
      );

      return rows[0]?.value ?? null;
    };

    const newForm = (organizationId: string) =>
      scalar(
        `INSERT INTO follow_up_forms (organization_id, name)
       VALUES ($1, 'Formulario') RETURNING id AS value`,
        [organizationId],
      ) as Promise<string>;

    const newDraft = (organizationId: string, formId: string) =>
      scalar(
        `INSERT INTO follow_up_form_versions (organization_id, form_id, status)
       VALUES ($1, $2, 'draft') RETURNING id AS value`,
        [organizationId, formId],
      ) as Promise<string>;

    const field = (
      values: FieldValues,
      target: { organizationId: string; formId: string; versionId: string } = {
        organizationId: orgA,
        formId: formA,
        versionId: draftA,
      },
    ) =>
      violation(
        dataSource,
        `INSERT INTO follow_up_form_fields
         (organization_id, form_id, version_id, field_key, name, field_type,
          required, active, position, unit, decimal_places, scale_min,
          scale_max, options)
       VALUES ($1, $2, $3, COALESCE($4::uuid, gen_random_uuid()), $5, $6, $7,
               $8, $9, $10, $11, $12, $13, $14::jsonb)`,
        [
          target.organizationId,
          target.formId,
          target.versionId,
          values.fieldKey ?? null,
          values.name ?? 'Campo',
          values.fieldType ?? 'number',
          values.required ?? false,
          values.active ?? true,
          values.position ?? 0,
          values.unit ?? null,
          values.decimalPlaces === undefined ? 0 : values.decimalPlaces,
          values.scaleMin ?? null,
          values.scaleMax ?? null,
          values.options ?? null,
        ],
      );

    beforeAll(async () => {
      dataSource = new DataSource({
        type: 'postgres',
        url: databaseUrl,
        entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
        migrations: MIGRATIONS,
        namingStrategy: new SnakeNamingStrategy(),
        synchronize: false,
        migrationsRun: false,
      });

      await dataSource.initialize();

      if (
        (await scalar(
          "SELECT to_regclass('public.organizations')::text AS value",
        )) !== null
      ) {
        throw new Error('O banco de teste ja contem a tabela organizations.');
      }

      migrated = (await dataSource.runMigrations({ transaction: 'each' }))
        .length;

      const plan = (await scalar(
        "SELECT id AS value FROM usage_plans WHERE code = 'basic'",
      ))!;
      const organization = async (code: string) =>
        (await scalar(
          `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
         VALUES ($1, 'Org', 'Org', $2) RETURNING id AS value`,
          [code, plan],
        ))!;
      const patientOf = async (organizationId: string) =>
        (await scalar(
          `INSERT INTO patients (organization_id, name, birth_date)
         VALUES ($1, 'Paciente', '1950-01-01') RETURNING id AS value`,
          [organizationId],
        ))!;

      orgA = await organization('schema-forms-a');
      orgB = await organization('schema-forms-b');

      const profile = (await scalar(
        `INSERT INTO access_profiles (organization_id, code, name)
       VALUES ($1, 'professional', 'Profissional') RETURNING id AS value`,
        [orgA],
      ))!;

      userA = (await scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
       VALUES ($1, $2, 'Profissional', 'prof@forms.test', '52998224725', 'active', false)
       RETURNING id AS value`,
        [orgA, profile],
      ))!;

      patientA = await patientOf(orgA);
      patientB = await patientOf(orgB);

      formA = await newForm(orgA);
      draftA = await newDraft(orgA, formA);
      publishedA = (await scalar(
        `INSERT INTO follow_up_form_versions
         (organization_id, form_id, status, version_number, published_at, published_by_user_id)
       VALUES ($1, $2, 'published', 1, now(), $3) RETURNING id AS value`,
        [orgA, formA, userA],
      ))!;
      formB = await newForm(orgB);
      versionB = await newDraft(orgB, formB);
    }, 60000);

    afterAll(async () => {
      if (!dataSource?.isInitialized) return;

      await dataSource.query(
        `TRUNCATE ${FORM_TABLES.join(', ')}, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans`,
      );

      for (let index = 0; index < migrated; index += 1) {
        await dataSource.undoLastMigration();
      }

      await dataSource.destroy();
    }, 60000);

    it('aplica todas as migrations, inclusive a do BE-11', () => {
      expect(migrated).toBe(MIGRATIONS.length);
    });

    it('aceita um campo valido de cada tipo', async () => {
      expect(await field({ fieldType: 'number', unit: 'mmHg' })).toBeNull();
      expect(
        await field({
          fieldType: 'scale',
          decimalPlaces: null,
          scaleMin: 0,
          scaleMax: 10,
        }),
      ).toBeNull();
      expect(
        await field({ fieldType: 'boolean', decimalPlaces: null }),
      ).toBeNull();
      expect(
        await field({ fieldType: 'text', decimalPlaces: null }),
      ).toBeNull();
      expect(
        await field({
          fieldType: 'single_choice',
          decimalPlaces: null,
          options: '["A","B"]',
        }),
      ).toBeNull();
      expect(
        await field({
          fieldType: 'multiple_choice',
          decimalPlaces: null,
          options: '["A","B"]',
        }),
      ).toBeNull();
    });

    it('recusa combinacoes invalidas por tipo e obrigatorio desabilitado', async () => {
      expect(
        await field({ fieldType: 'scale', decimalPlaces: null, scaleMax: 10 }),
      ).toBe('follow_up_form_fields_type_config_check');
      expect(await field({ fieldType: 'number', options: '["A","B"]' })).toBe(
        'follow_up_form_fields_type_config_check',
      );
      expect(await field({ required: true, active: false })).toBe(
        'follow_up_form_fields_requirement_check',
      );
      expect(await field({ decimalPlaces: 4 })).toBe(
        'follow_up_form_fields_decimal_places_check',
      );
      expect(await field({ fieldType: 'unknown' })).toBe(
        'follow_up_form_fields_field_type_check',
      );
    });

    it('versao publicada exige numero, data e autor; forma inativa exige deleted_at; frequencia vem em par', async () => {
      expect(
        await violation(
          dataSource,
          `INSERT INTO follow_up_form_versions (organization_id, form_id, status)
         VALUES ($1, $2, 'published')`,
          [orgA, formA],
        ),
      ).toBe('follow_up_form_versions_status_check');
      expect(
        await violation(
          dataSource,
          `UPDATE follow_up_forms SET status = 'inactive' WHERE id = $1`,
          [formA],
        ),
      ).toBe('follow_up_forms_deactivation_check');
      expect(
        await violation(
          dataSource,
          `UPDATE follow_up_forms SET frequency_interval = 1 WHERE id = $1`,
          [formA],
        ),
      ).toBe('follow_up_forms_frequency_check');
    });

    it('unicidade: um rascunho vivo, numero de versao, chave e nome por versao', async () => {
      expect(
        await violation(
          dataSource,
          `INSERT INTO follow_up_form_versions (organization_id, form_id, status)
         VALUES ($1, $2, 'draft')`,
          [orgA, formA],
        ),
      ).toBe('follow_up_form_versions_single_draft_unique');
      expect(
        await violation(
          dataSource,
          `INSERT INTO follow_up_form_versions (organization_id, form_id, status, deleted_at)
         VALUES ($1, $2, 'draft', now())`,
          [orgA, formA],
        ),
      ).toBeNull();
      expect(
        await violation(
          dataSource,
          `INSERT INTO follow_up_form_versions
           (organization_id, form_id, status, version_number, published_at, published_by_user_id)
         VALUES ($1, $2, 'published', 1, now(), $3)`,
          [orgA, formA, userA],
        ),
      ).toBe('follow_up_form_versions_number_unique');

      const key = '7a5b3c1d-0000-4000-8000-000000000001';

      await dataSource.query(
        `INSERT INTO follow_up_form_fields
         (organization_id, form_id, version_id, field_key, name, field_type,
          required, active, position, decimal_places)
       VALUES ($1, $2, $3, $4, 'Glicemia', 'number', false, true, 0, 0)`,
        [orgA, formA, publishedA, key],
      );

      const published = {
        organizationId: orgA,
        formId: formA,
        versionId: publishedA,
      };

      expect(
        await field({ name: 'Outro', fieldKey: key, position: 1 }, published),
      ).toBe('follow_up_form_fields_version_key_unique');
      expect(await field({ name: ' glicemia ', position: 1 }, published)).toBe(
        'follow_up_form_fields_version_name_unique',
      );
      expect(await field({ name: 'Peso', position: 0 }, published)).toBe(
        'follow_up_form_fields_version_position_unique',
      );
    });

    it('FKs compostas recusam campo e paciente de outra organizacao', async () => {
      expect(
        await field(
          {},
          { organizationId: orgA, formId: formB, versionId: versionB },
        ),
      ).toBe('follow_up_form_fields_form_tenant_fk');
      expect(
        await field(
          {},
          { organizationId: orgA, formId: formA, versionId: versionB },
        ),
      ).toBe('follow_up_form_fields_version_tenant_fk');

      const otherForm = await newForm(orgA);

      expect(
        await field(
          {},
          { organizationId: orgA, formId: otherForm, versionId: draftA },
        ),
      ).toBe('follow_up_form_fields_version_tenant_fk');
      expect(
        await violation(
          dataSource,
          `INSERT INTO follow_up_form_patients (organization_id, form_id, patient_id)
         VALUES ($1, $2, $3)`,
          [orgA, formA, patientB],
        ),
      ).toBe('follow_up_form_patients_patient_tenant_fk');
      expect(
        await violation(
          dataSource,
          `INSERT INTO follow_up_form_patients (organization_id, form_id, patient_id)
         VALUES ($1, $2, $3)`,
          [orgA, formA, patientA],
        ),
      ).toBeNull();
    });

    it('nao sugere criar ou remover tabela ou coluna de formularios', async () => {
      const log = await dataSource.driver.createSchemaBuilder().log();
      const pending = log.upQueries
        .map((query) => query.query)
        .filter((query) => FORM_TABLES.some((table) => query.includes(table)))
        .filter((query) =>
          /\b(?:CREATE|DROP) TABLE\b|\b(?:ADD|DROP) COLUMN\b/.test(query),
        );

      expect(pending).toEqual([]);
    });

    it('o down remove as tabelas e restaura o rotulo de forms:deactivate', async () => {
      const label = () =>
        scalar(
          `SELECT name AS value FROM permissions WHERE code = 'forms:deactivate'`,
        );

      expect(await label()).toBe('Desativar e reativar formularios');

      await dataSource.query(`TRUNCATE ${FORM_TABLES.join(', ')}`);
      await dataSource.undoLastMigration();
      migrated -= 1;

      expect(await label()).toBe('Desativar formularios');
      expect(
        await scalar(
          "SELECT to_regclass('public.follow_up_forms')::text AS value",
        ),
      ).toBeNull();

      await dataSource.runMigrations();
      migrated += 1;
    });
  },
);
