import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { DispatchMedicationRemindersUseCase } from '@/modules/Automation/DispatchMedicationReminders/dispatchMedicationReminders.useCase';
import { MedicationReminderDispatchRepository } from '@/modules/Automation/repositories/medicationReminderDispatch.repository';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';

import {
  type Org,
  seeder,
  testDataSource,
  TRUNCATE_AUTOMATION,
} from './automation.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface ReminderAlert {
  organizationId: string;
  patientId: string;
  medicationId: string;
  severity: string;
  title: string;
  message: string;
  scheduledAt: Date;
}

describeWithDatabase(
  'disparo de lembretes de medicamento em PostgreSQL (e2e)',
  () => {
    let dataSource: DataSource;
    let dispatch: DispatchMedicationRemindersUseCase;
    let medications: MedicationRepository;
    let seed: ReturnType<typeof seeder>;
    let A: Org;
    let B: Org;

    const remindersOf = (medicationId: string) =>
      dataSource.query<ReminderAlert[]>(
        `SELECT organization_id AS "organizationId", patient_id AS "patientId",
              medication_id AS "medicationId", severity, title, message,
              scheduled_at AS "scheduledAt"
         FROM alerts
        WHERE source = 'medication_reminder' AND medication_id = $1
        ORDER BY scheduled_at`,
        [medicationId],
      );

    /** Simula o tempo: a linha da agenda existe e foi conferida ha `ago`. */
    const pendingSince = (medicationId: string, ago: string) =>
      dataSource.query(
        `UPDATE medication_reminders
          SET created_at = now() - $2::interval,
              dispatched_through = now() - $2::interval
        WHERE medication_id = $1 AND deleted_at IS NULL`,
        [medicationId, ago],
      );

    const actor = (org: Org) => ({
      organizationId: org.id,
      viewerUserId: null,
      viewerLinkRoles: [],
      actorUserId: org.user,
      requestId: randomUUID(),
    });

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
      medications = new MedicationRepository(dataSource);
      dispatch = new DispatchMedicationRemindersUseCase(
        new MedicationReminderDispatchRepository(dataSource),
      );
      A = await seed.organization('lembrete-a');
      B = await seed.organization('lembrete-b');
    }, 120000);

    afterAll(async () => {
      if (!dataSource?.isInitialized) return;

      await dataSource.query(TRUNCATE_AUTOMATION);

      for (const _ of await dataSource.query('SELECT 1 FROM migrations')) {
        await dataSource.undoLastMigration();
      }

      await dataSource.destroy();
    }, 120000);

    it('horario vencido gera um lembrete info com a origem, a mensagem e auditoria', async () => {
      const patient = await seed.patient(A);
      const { medication, reminder } = await seed.medication(A, patient, {
        time: '08:00',
      });

      await pendingSince(medication, '24 hours');
      await dispatch.execute();

      const alerts = await remindersOf(medication);

      expect(alerts).toEqual([
        expect.objectContaining({
          organizationId: A.id,
          patientId: patient,
          severity: 'info',
          title: 'Lembrete de medicamento',
          message: 'Losartana 50 mg às 08:00.',
        }),
      ]);

      const [row] = await dataSource.query<
        Array<{ reminderId: string; after: Record<string, unknown> }>
      >(
        `SELECT a.medication_reminder_id AS "reminderId", e.after_values AS after
         FROM alerts a
         JOIN audit_events e ON e.entity_id = a.id AND e.action = 'alert.generated'
        WHERE a.medication_id = $1`,
        [medication],
      );

      expect(row.reminderId).toBe(reminder);
      expect(row.after).toEqual({
        source: 'medication_reminder',
        medicationId: medication,
        reminderId: reminder,
        scheduledAt: alerts[0].scheduledAt.toISOString(),
        severity: 'info',
      });
    });

    it('repetir o disparo, mesmo com o cursor recuado, nao duplica', async () => {
      const patient = await seed.patient(A);
      const { medication } = await seed.medication(A, patient);

      await pendingSince(medication, '24 hours');
      await dispatch.execute();
      await dispatch.execute();
      await dataSource.query(
        `UPDATE medication_reminders SET dispatched_through = created_at
        WHERE medication_id = $1`,
        [medication],
      );
      await dispatch.execute();

      expect(await remindersOf(medication)).toHaveLength(1);
    });

    it('disparos simultaneos nao duplicam', async () => {
      const patient = await seed.patient(A);
      const { medication } = await seed.medication(A, patient);

      await pendingSince(medication, '72 hours');
      await Promise.all([
        dispatch.execute(),
        dispatch.execute(),
        dispatch.execute(),
      ]);

      expect(await remindersOf(medication)).toHaveLength(3);
    });

    it('editar a agenda encerra a linha e cancela o que ela ainda nao gerou', async () => {
      const patient = await seed.patient(A);
      const { medication } = await seed.medication(A, patient);

      await pendingSince(medication, '24 hours');

      expect(
        (
          await medications.update({
            ...actor(A),
            medicationId: medication,
            fields: {},
            schedule: { times: ['21:00'] },
          })
        ).kind,
      ).toBe('updated');

      await dispatch.execute();

      expect(await remindersOf(medication)).toHaveLength(0);
    });

    it('inativar o medicamento cancela os horarios pendentes', async () => {
      const patient = await seed.patient(A);
      const { medication } = await seed.medication(A, patient);

      await pendingSince(medication, '24 hours');
      await medications.deactivate({ ...actor(A), medicationId: medication });
      await dispatch.execute();

      expect(await remindersOf(medication)).toHaveLength(0);
    });

    it('edicao concorrente nunca gera horario depois do fim da linha', async () => {
      const patient = await seed.patient(A);
      const { medication, reminder } = await seed.medication(A, patient);

      await pendingSince(medication, '72 hours');
      await Promise.all([
        dispatch.execute(),
        medications.update({
          ...actor(A),
          medicationId: medication,
          fields: {},
          schedule: { times: ['21:00'] },
        }),
        dispatch.execute(),
      ]);

      const [{ endedAt }] = await dataSource.query<Array<{ endedAt: Date }>>(
        'SELECT deleted_at AS "endedAt" FROM medication_reminders WHERE id = $1',
        [reminder],
      );

      for (const alert of await remindersOf(medication)) {
        expect(alert.scheduledAt.getTime()).toBeLessThan(endedAt.getTime());
      }
    });

    it('disparo e edicao travam na mesma ordem: sem deadlock, a edicao vence', async () => {
      const patient = await seed.patient(A);
      const { medication, reminder } = await seed.medication(A, patient);

      await pendingSince(medication, '24 hours');

      // Mesmos passos da edicao: trava o medicamento, depois encerra a linha.
      const edit = dataSource.createQueryRunner();

      await edit.startTransaction();
      await edit.query('SELECT 1 FROM medications WHERE id = $1 FOR UPDATE', [
        medication,
      ]);

      const running = dispatch.execute();

      await new Promise((resolve) => setTimeout(resolve, 300));
      await edit.query(
        `UPDATE medication_reminders
          SET status = 'ended', deleted_at = now(), updated_at = now()
        WHERE id = $1`,
        [reminder],
      );
      await edit.commitTransaction();
      await edit.release();

      expect((await running).failed).toBe(0);
      expect(await remindersOf(medication)).toHaveLength(0);
    });

    it('linha sem horario vencido e agenda encerrada ficam fora da varredura seguinte', async () => {
      const patient = await seed.patient(A);
      const current = await seed.medication(A, patient);
      const finished = await seed.medication(A, patient, {
        startDate: '2026-01-01',
      });
      const repository = new MedicationReminderDispatchRepository(dataSource);

      await dataSource.query(
        "UPDATE medication_reminders SET end_date = '2026-01-10' WHERE id = $1",
        [finished.reminder],
      );
      await pendingSince(current.medication, '24 hours');
      await dispatch.execute();

      const due = (
        await repository.findDue(await repository.now(), 1000, [])
      ).map((item) => item.id);

      expect(due).not.toContain(current.reminder);
      expect(due).not.toContain(finished.reminder);
      expect(await remindersOf(current.medication)).toHaveLength(1);
    });

    it('lembretes desligados nao geram nada', async () => {
      const patient = await seed.patient(A);
      const { medication } = await seed.medication(A, patient, {
        remindersEnabled: false,
      });

      await pendingSince(medication, '72 hours');
      await dispatch.execute();

      expect(await remindersOf(medication)).toHaveLength(0);
    });

    it('paciente inativo consome o horario sem gerar e nada acumula para a reativacao', async () => {
      const patient = await seed.patient(A);
      const { medication } = await seed.medication(A, patient);

      await pendingSince(medication, '24 hours');
      await dataSource.query(
        "UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1",
        [patient],
      );
      await dispatch.execute();
      await dataSource.query(
        "UPDATE patients SET status = 'active', deleted_at = NULL WHERE id = $1",
        [patient],
      );
      await dispatch.execute();

      expect(await remindersOf(medication)).toHaveLength(0);
    });

    it('depois de uma queda de tres dias gera cada horario perdido', async () => {
      const patient = await seed.patient(A);
      const { medication } = await seed.medication(A, patient);

      await dataSource.query(
        `INSERT INTO medication_reminders
         (organization_id, medication_id, start_date, interval_days, time_of_day)
       VALUES ($1, $2, '2026-01-01', 1, '20:00')`,
        [A.id, medication],
      );
      await pendingSince(medication, '72 hours');
      await dispatch.execute();

      const alerts = await remindersOf(medication);

      expect(alerts).toHaveLength(6);
      expect(new Set(alerts.map((alert) => alert.message)).size).toBe(2);
    });

    it('limita a cinquenta por linha e por execucao e entrega o resto na seguinte', async () => {
      const patient = await seed.patient(A);
      const { medication } = await seed.medication(A, patient);

      await pendingSince(medication, '60 days');
      await dispatch.execute();
      expect(await remindersOf(medication)).toHaveLength(50);

      await dispatch.execute();
      expect(await remindersOf(medication)).toHaveLength(60);
    });

    it('cada lembrete fica na organizacao e no paciente do medicamento', async () => {
      const patientA = await seed.patient(A);
      const patientB = await seed.patient(B);
      const a = await seed.medication(A, patientA);
      const b = await seed.medication(B, patientB);

      await pendingSince(a.medication, '24 hours');
      await pendingSince(b.medication, '24 hours');
      await dispatch.execute();

      expect(await remindersOf(a.medication)).toEqual([
        expect.objectContaining({ organizationId: A.id, patientId: patientA }),
      ]);
      expect(await remindersOf(b.medication)).toEqual([
        expect.objectContaining({ organizationId: B.id, patientId: patientB }),
      ]);
    });
  },
);
