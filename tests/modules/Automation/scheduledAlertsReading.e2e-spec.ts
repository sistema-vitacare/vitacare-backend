import { DataSource } from 'typeorm';

import { AlertRepository } from '@/modules/Alert/repositories/alert.repository';
import type { AlertScope } from '@/modules/Alert/types/alert.types';
import { DispatchMedicationRemindersUseCase } from '@/modules/Automation/DispatchMedicationReminders/dispatchMedicationReminders.useCase';
import { AbsenceMonitorRepository } from '@/modules/Automation/repositories/absenceMonitor.repository';
import { MedicationReminderDispatchRepository } from '@/modules/Automation/repositories/medicationReminderDispatch.repository';
import { SweepAbsencesUseCase } from '@/modules/Automation/SweepAbsences/sweepAbsences.useCase';

import {
  type Org,
  seeder,
  testDataSource,
  TRUNCATE_AUTOMATION,
} from './automation.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

/**
 * `GET /alerts` le as tres origens pela mesma consulta e no mesmo alcance de
 * pacientes do BE-15; aqui o repositorio e exercitado direto no banco.
 */
describeWithDatabase(
  'leitura dos alertas agendados em PostgreSQL (e2e)',
  () => {
    let dataSource: DataSource;
    let alerts: AlertRepository;
    let seed: ReturnType<typeof seeder>;
    let A: Org;
    let B: Org;
    let patient: string;
    let form: { id: string };
    let medication: string;
    let reminder: string;
    let linkedCaregiver: string;
    let unlinkedCaregiver: string;

    const wholeOrganization = (org: Org): AlertScope => ({
      organizationId: org.id,
      viewerUserId: null,
      viewerLinkRoles: [],
      viewerId: org.user,
    });

    const caregiverScope = (userId: string): AlertScope => ({
      organizationId: A.id,
      viewerUserId: userId,
      viewerLinkRoles: ['caregiver'],
      viewerId: userId,
    });

    const caregiver = async (label: string) =>
      await seed.scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
       SELECT $1, profile_id, $2, $3, $4, 'active', false
         FROM users WHERE id = $5
       RETURNING id AS value`,
        [
          A.id,
          label,
          `${label}@a.test`,
          label === 'ligado' ? '39053344705' : '15350946056',
          A.user,
        ],
      );

    beforeAll(async () => {
      dataSource = testDataSource(databaseUrl!);
      await dataSource.initialize();

      if (
        (
          await dataSource.query<Array<{ value: string | null }>>(
            "SELECT to_regclass('public.organizations')::text AS value",
          )
        )[0].value !== null
      ) {
        throw new Error('O banco de teste ja contem a tabela organizations.');
      }

      await dataSource.runMigrations();
      seed = seeder(dataSource);
      alerts = new AlertRepository(dataSource);
      A = await seed.organization('leitura-a');
      B = await seed.organization('leitura-b');

      patient = await seed.patient(A);
      form = await seed.form(A, { patients: [patient], name: 'Sinais vitais' });
      ({ medication, reminder } = await seed.medication(A, patient, {
        time: '08:00',
      }));
      linkedCaregiver = await caregiver('ligado');
      unlinkedCaregiver = await caregiver('solto');
      await dataSource.query(
        `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, 'caregiver')`,
        [A.id, linkedCaregiver, patient],
      );

      const sweep = new SweepAbsencesUseCase(
        new AbsenceMonitorRepository(dataSource),
      );

      await sweep.execute();
      await dataSource.query(
        `UPDATE follow_up_absence_monitors
          SET started_at = now() - interval '25 hours',
              checked_through = now() - interval '25 hours',
              next_due_at = NULL
        WHERE patient_id = $1`,
        [patient],
      );
      await sweep.execute();
      await dataSource.query(
        `UPDATE medication_reminders
          SET created_at = now() - interval '24 hours',
              dispatched_through = now() - interval '24 hours'
        WHERE id = $1`,
        [reminder],
      );
      await new DispatchMedicationRemindersUseCase(
        new MedicationReminderDispatchRepository(dataSource),
      ).execute();
    }, 120000);

    afterAll(async () => {
      if (!dataSource?.isInitialized) return;

      await dataSource.query(TRUNCATE_AUTOMATION);

      for (const _ of await dataSource.query('SELECT 1 FROM migrations')) {
        await dataSource.undoLastMigration();
      }

      await dataSource.destroy();
    }, 120000);

    it('lista ausencia e lembrete com o bloco da propria origem e nulos nos demais', async () => {
      const outcome = await alerts.list(wholeOrganization(A), {
        patientId: patient,
        skip: 0,
        take: 20,
      });

      expect(outcome.kind).toBe('ok');
      if (outcome.kind !== 'ok') return;

      const absence = outcome.items.find((item) => item.source === 'absence')!;
      const reminderAlert = outcome.items.find(
        (item) => item.source === 'medication_reminder',
      )!;

      expect(outcome.total).toBe(2);
      expect(absence).toMatchObject({
        severity: 'warning',
        rule: null,
        followUp: null,
        field: null,
        value: null,
        operator: null,
        referenceValue: null,
        medicationReminder: null,
        absence: {
          form: { id: form.id, name: 'Sinais vitais' },
          frequency: { interval: 1, unit: 'days' },
        },
      });
      expect(
        absence.absence!.dueAt.getTime() - absence.absence!.since.getTime(),
      ).toBe(86_400_000);
      expect(reminderAlert).toMatchObject({
        severity: 'info',
        rule: null,
        followUp: null,
        absence: null,
        medicationReminder: {
          medication: { id: medication, name: 'Losartana' },
          reminderId: reminder,
        },
        message: 'Losartana 50 mg às 08:00.',
      });
      expect(reminderAlert.medicationReminder!.scheduledAt).toBeInstanceOf(
        Date,
      );
    });

    it('filtra por severidade', async () => {
      const outcome = await alerts.list(wholeOrganization(A), {
        patientId: patient,
        severity: 'info',
        skip: 0,
        take: 20,
      });

      expect(
        outcome.kind === 'ok' && outcome.items.map((item) => item.source),
      ).toEqual(['medication_reminder']);
    });

    it('cuidador vinculado le; sem vinculo e outra organizacao nao veem', async () => {
      const linked = await alerts.list(caregiverScope(linkedCaregiver), {
        patientId: patient,
        skip: 0,
        take: 20,
      });

      expect(linked.kind === 'ok' && linked.total).toBe(2);
      expect(
        await alerts.list(caregiverScope(unlinkedCaregiver), {
          patientId: patient,
          skip: 0,
          take: 20,
        }),
      ).toEqual({ kind: 'patient_not_found' });
      expect(
        await alerts.list(wholeOrganization(B), {
          patientId: patient,
          skip: 0,
          take: 20,
        }),
      ).toEqual({ kind: 'patient_not_found' });
    });

    it('detalhe respeita o alcance', async () => {
      const outcome = await alerts.list(wholeOrganization(A), {
        patientId: patient,
        skip: 0,
        take: 20,
      });
      const ids =
        outcome.kind === 'ok' ? outcome.items.map((item) => item.id) : [];

      for (const id of ids) {
        expect(
          await alerts.findById(caregiverScope(linkedCaregiver), id),
        ).not.toBeNull();
        expect(
          await alerts.findById(caregiverScope(unlinkedCaregiver), id),
        ).toBeNull();
        expect(await alerts.findById(wholeOrganization(B), id)).toBeNull();
      }
      expect(ids).toHaveLength(2);
    });
  },
);
