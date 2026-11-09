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
import { CreateScheduledAlerts1791400000000 } from '@/database/migrations/1791400000000-CreateScheduledAlerts';
import { CreateAlertNotifications1791500000000 } from '@/database/migrations/1791500000000-CreateAlertNotifications';
import { AddDashboardIndexes1791600000000 } from '@/database/migrations/1791600000000-AddDashboardIndexes';
import { AuditEventQuery1791700000000 } from '@/database/migrations/1791700000000-AuditEventQuery';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

export const ALL_MIGRATIONS = [
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
  CreateAlerts1791300000000,
  CreateScheduledAlerts1791400000000,
  CreateAlertNotifications1791500000000,
  AddDashboardIndexes1791600000000,
  AuditEventQuery1791700000000,
];

export const TRUNCATE_AUTOMATION =
  'TRUNCATE notification_deliveries, push_subscriptions, alert_notifications, notification_preferences, alerts, follow_up_absence_monitors, alert_rules, medication_reminders, medications, follow_up_attachments, follow_up_response_items, follow_up_responses, follow_up_records, follow_up_form_patients, follow_up_form_fields, follow_up_form_versions, follow_up_forms, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans CASCADE';

export const testDataSource = (url: string) =>
  new DataSource({
    type: 'postgres',
    url,
    entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
    migrations: ALL_MIGRATIONS as never,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
  });

export interface Org {
  id: string;
  user: string;
}

/**
 * Semeia organizacoes, pacientes, formularios, registros e medicamentos direto
 * no banco: a varredura so le o estado persistido.
 */
export const seeder = (dataSource: DataSource) => {
  let cpfSequence = 0;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value;
  };

  const cpf = (): string => {
    cpfSequence += 1;
    const base = String(300000000 + cpfSequence * 7919);
    const digit = (digits: string, weightStart: number) => {
      const sum = [...digits].reduce(
        (total, value, index) => total + Number(value) * (weightStart - index),
        0,
      );
      const remainder = (sum * 10) % 11;

      return remainder === 10 ? 0 : remainder;
    };
    const first = digit(base, 10);

    return `${base}${first}${digit(`${base}${first}`, 11)}`;
  };

  return {
    scalar,

    async organization(code: string): Promise<Org> {
      const plan = await scalar(
        "SELECT id AS value FROM usage_plans WHERE code = 'basic'",
      );
      const id = await scalar(
        `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
         VALUES ($1, $1, $1, $2) RETURNING id AS value`,
        [code, plan],
      );
      await dataSource.query(
        `INSERT INTO access_profiles (organization_id, code, name)
         VALUES ($1, 'professional', 'professional')`,
        [id],
      );
      const user = await scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
         SELECT $1, id, 'Profissional', $2, $3, 'active', false
           FROM access_profiles WHERE organization_id = $1
         RETURNING id AS value`,
        [id, `p@${code}.test`, cpf()],
      );

      return { id, user };
    },

    patient: async (org: Org, status: 'active' | 'inactive' = 'active') =>
      await scalar(
        `INSERT INTO patients (organization_id, name, birth_date, status, deleted_at)
         VALUES ($1, 'Paciente Sintetico', '1948-03-12', $2::varchar,
                 CASE WHEN $2::varchar = 'inactive' THEN now() END)
         RETURNING id AS value`,
        [org.id, status],
      ),

    /** Formulario ativo com versao publicada; `patients` restringe o publico. */
    async form(
      org: Org,
      {
        interval = 1,
        unit = 'days',
        patients,
        name = 'Acompanhamento Geral',
      }: {
        interval?: number | null;
        unit?: string;
        patients?: string[];
        name?: string;
      } = {},
    ): Promise<{ id: string; version: string }> {
      const id = await scalar(
        `INSERT INTO follow_up_forms
           (organization_id, name, status, audience, frequency_interval, frequency_unit)
         VALUES ($1, $2, 'active', $3, $4, $5) RETURNING id AS value`,
        [
          org.id,
          name,
          patients ? 'patients' : 'organization',
          interval,
          interval === null ? null : unit,
        ],
      );
      const version = await scalar(
        `INSERT INTO follow_up_form_versions
           (organization_id, form_id, version_number, status, published_at, published_by_user_id)
         VALUES ($1, $2, 1, 'published', now(), $3) RETURNING id AS value`,
        [org.id, id, org.user],
      );

      for (const patient of patients ?? []) {
        await dataSource.query(
          `INSERT INTO follow_up_form_patients (organization_id, form_id, patient_id)
           VALUES ($1, $2, $3)`,
          [org.id, id, patient],
        );
      }

      return { id, version };
    },

    /** Registro valido enviado `ago` atras (intervalo PostgreSQL). */
    async record(
      org: Org,
      patient: string,
      form: { id: string; version: string },
      ago: string,
    ): Promise<string> {
      const record = await scalar(
        `INSERT INTO follow_up_records
           (organization_id, patient_id, author_user_id, visited_at, created_at, alerts_evaluated_at)
         VALUES ($1, $2, $3, now() - $4::interval, now() - $4::interval, now())
         RETURNING id AS value`,
        [org.id, patient, org.user, ago],
      );
      await dataSource.query(
        `INSERT INTO follow_up_responses (organization_id, record_id, form_id, form_version_id)
         VALUES ($1, $2, $3, $4)`,
        [org.id, record, form.id, form.version],
      );

      return record;
    },

    /** Medicamento ativo com uma linha de agenda vigente criada `ago` atras. */
    async medication(
      org: Org,
      patient: string,
      {
        time = '08:00',
        startDate = '2026-01-01',
        intervalDays = 1,
        remindersEnabled = true,
      }: {
        time?: string;
        startDate?: string;
        intervalDays?: number;
        remindersEnabled?: boolean;
      } = {},
    ): Promise<{ medication: string; reminder: string }> {
      const medication = await scalar(
        `INSERT INTO medications
           (organization_id, patient_id, created_by_user_id, name, dose_amount,
            dose_unit, reminders_enabled)
         VALUES ($1, $2, $3, 'Losartana', 50, 'mg', $4) RETURNING id AS value`,
        [org.id, patient, org.user, remindersEnabled],
      );
      const reminder = await scalar(
        `INSERT INTO medication_reminders
           (organization_id, medication_id, start_date, interval_days, time_of_day)
         VALUES ($1, $2, $3, $4, $5) RETURNING id AS value`,
        [org.id, medication, startDate, intervalDays, time],
      );

      return { medication, reminder };
    },
  };
};
