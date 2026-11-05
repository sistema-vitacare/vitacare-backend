import { DataSource } from 'typeorm';

import { AbsenceMonitorRepository } from '@/modules/Automation/repositories/absenceMonitor.repository';
import { SweepAbsencesUseCase } from '@/modules/Automation/SweepAbsences/sweepAbsences.useCase';

import {
  type Org,
  seeder,
  testDataSource,
  TRUNCATE_AUTOMATION,
} from './automation.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface AbsenceAlert {
  organizationId: string;
  patientId: string;
  formId: string;
  severity: string;
  title: string;
  message: string;
  absenceSince: Date;
  dueAt: Date;
  frequencyInterval: number;
  frequencyUnit: string;
}

describeWithDatabase('varredura de ausencia em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let sweep: SweepAbsencesUseCase;
  let seed: ReturnType<typeof seeder>;
  let A: Org;
  let B: Org;

  const absencesOf = (patientId: string, formId: string) =>
    dataSource.query<AbsenceAlert[]>(
      `SELECT organization_id AS "organizationId", patient_id AS "patientId",
              form_id AS "formId", severity, title, message,
              absence_since AS "absenceSince", due_at AS "dueAt",
              frequency_interval AS "frequencyInterval",
              frequency_unit AS "frequencyUnit"
         FROM alerts
        WHERE source = 'absence' AND patient_id = $1 AND form_id = $2
        ORDER BY due_at`,
      [patientId, formId],
    );

  const monitorsOf = (patientId: string, formId: string) =>
    dataSource.query<
      Array<{ id: string; status: string; deletedAt: Date | null }>
    >(
      `SELECT id, status, deleted_at AS "deletedAt"
         FROM follow_up_absence_monitors
        WHERE patient_id = $1 AND form_id = $2
        ORDER BY created_at`,
      [patientId, formId],
    );

  /** Simula o tempo: o par passa a ter comecado `ago` atras. */
  const startedAgo = (patientId: string, formId: string, ago: string) =>
    dataSource.query(
      `UPDATE follow_up_absence_monitors
          SET started_at = now() - $2::interval,
              checked_through = now() - $2::interval
        WHERE patient_id = $1 AND form_id = $3 AND deleted_at IS NULL`,
      [patientId, ago, formId],
    );

  /** Paciente monitorado ha `ago`, num formulario novo de frequencia dada. */
  const monitoredPatient = async (
    org: Org,
    ago: string,
    frequency: { interval?: number; unit?: string } = {},
  ) => {
    const patient = await seed.patient(org);
    const form = await seed.form(org, { ...frequency, patients: [patient] });

    await sweep.execute();
    await startedAgo(patient, form.id, ago);

    return { patient, form };
  };

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
    sweep = new SweepAbsencesUseCase(new AbsenceMonitorRepository(dataSource));
    A = await seed.organization('ausencia-a');
    B = await seed.organization('ausencia-b');
  }, 120000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;

    await dataSource.query(TRUNCATE_AUTOMATION);

    for (const _ of await dataSource.query('SELECT 1 FROM migrations')) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 120000);

  it('monitora so pares de paciente ativo e formulario ativo com frequencia aplicavel', async () => {
    const eligible = await seed.patient(A);
    const inactive = await seed.patient(A, 'inactive');
    const listed = await seed.patient(A);
    const unlisted = await seed.patient(A);

    const general = await seed.form(A);
    const withoutFrequency = await seed.form(A, { interval: null });
    const draft = await seed.form(A);
    await dataSource.query(
      "UPDATE follow_up_forms SET status = 'draft' WHERE id = $1",
      [draft.id],
    );
    const restricted = await seed.form(A, { patients: [listed] });

    await sweep.execute();

    const pairs = await dataSource.query<
      Array<{ patientId: string; formId: string }>
    >(
      `SELECT patient_id AS "patientId", form_id AS "formId"
         FROM follow_up_absence_monitors
        WHERE deleted_at IS NULL AND form_id = ANY($1)`,
      [[general.id, withoutFrequency.id, draft.id, restricted.id]],
    );
    const has = (patientId: string, formId: string) =>
      pairs.some(
        (pair) => pair.patientId === patientId && pair.formId === formId,
      );

    expect(has(eligible, general.id)).toBe(true);
    expect(has(listed, restricted.id)).toBe(true);
    expect(has(unlisted, restricted.id)).toBe(false);
    expect(has(inactive, general.id)).toBe(false);
    expect(pairs.some((pair) => pair.formId === withoutFrequency.id)).toBe(
      false,
    );
    expect(pairs.some((pair) => pair.formId === draft.id)).toBe(false);
  });

  it('gera um alerta warning por periodo vencido, com a copia da origem e auditoria', async () => {
    const { patient, form } = await monitoredPatient(A, '25 hours');

    await sweep.execute();

    const [alert, ...rest] = await absencesOf(patient, form.id);

    expect(rest).toHaveLength(0);
    expect(alert).toMatchObject({
      organizationId: A.id,
      patientId: patient,
      formId: form.id,
      severity: 'warning',
      title: 'Ausência de registro',
      frequencyInterval: 1,
      frequencyUnit: 'days',
    });
    expect(alert.message).toMatch(
      /^Sem registro de Acompanhamento Geral desde \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}; esperado a cada 1 dia\.$/,
    );
    expect(alert.dueAt.getTime() - alert.absenceSince.getTime()).toBe(
      86_400_000,
    );

    const audit = await dataSource.query<
      Array<{ after: Record<string, unknown> }>
    >(
      `SELECT after_values AS after FROM audit_events
        WHERE action = 'alert.generated' AND entity_id = (
          SELECT id FROM alerts WHERE source = 'absence' AND patient_id = $1)`,
      [patient],
    );

    expect(audit).toHaveLength(1);
    expect(audit[0].after).toEqual({
      source: 'absence',
      formId: form.id,
      dueAt: alert.dueAt.toISOString(),
      severity: 'warning',
    });
  });

  it('repetir a varredura nao duplica', async () => {
    const { patient, form } = await monitoredPatient(A, '49 hours');

    await sweep.execute();
    await sweep.execute();
    await dataSource.query(
      `UPDATE follow_up_absence_monitors SET checked_through = started_at
        WHERE patient_id = $1 AND form_id = $2`,
      [patient, form.id],
    );
    await sweep.execute();

    expect(await absencesOf(patient, form.id)).toHaveLength(2);
  });

  it('varreduras simultaneas nao duplicam alerta nem par', async () => {
    const patient = await seed.patient(A);
    const form = await seed.form(A, { patients: [patient] });

    await Promise.all([sweep.execute(), sweep.execute(), sweep.execute()]);
    expect(await monitorsOf(patient, form.id)).toHaveLength(1);

    await startedAgo(patient, form.id, '73 hours');
    await Promise.all([sweep.execute(), sweep.execute(), sweep.execute()]);

    const alerts = await absencesOf(patient, form.id);

    expect(alerts).toHaveLength(3);
    expect(new Set(alerts.map((alert) => alert.dueAt.getTime())).size).toBe(3);
  });

  it('registro valido dentro do prazo reinicia a contagem', async () => {
    const { patient, form } = await monitoredPatient(A, '3 days');

    await seed.record(A, patient, form, '1 hour');
    await sweep.execute();

    expect(await absencesOf(patient, form.id)).toHaveLength(0);
  });

  it('registro de outro formulario nao conta', async () => {
    const { patient, form } = await monitoredPatient(A, '25 hours');
    const other = await seed.form(A, { interval: null, name: 'Outro' });

    await seed.record(A, patient, other, '1 hour');
    await sweep.execute();

    expect(await absencesOf(patient, form.id)).toHaveLength(1);
  });

  it('registro anulado deixa de contar sem gerar alerta retroativo', async () => {
    const { patient, form } = await monitoredPatient(A, '3 days 30 minutes');
    const record = await seed.record(A, patient, form, '20 hours');

    await sweep.execute();
    expect(await absencesOf(patient, form.id)).toHaveLength(0);

    await dataSource.query(
      `UPDATE follow_up_records
          SET status = 'annulled', deleted_at = now(),
              annulled_by_user_id = author_user_id, annulment_reason = 'Erro'
        WHERE id = $1`,
      [record],
    );
    await dataSource.query(
      `UPDATE follow_up_absence_monitors SET checked_through = now() - interval '1 hour'
        WHERE patient_id = $1 AND form_id = $2`,
      [patient, form.id],
    );
    await sweep.execute();

    // So o prazo dentro da ultima hora; os dois anteriores ja tinham passado.
    expect(await absencesOf(patient, form.id)).toHaveLength(1);
  });

  it.each([
    [
      'frequencia retirada',
      (form: string) =>
        `UPDATE follow_up_forms SET frequency_interval = NULL, frequency_unit = NULL WHERE id = '${form}'`,
    ],
    [
      'formulario inativo',
      (form: string) =>
        `UPDATE follow_up_forms SET status = 'inactive', deleted_at = now() WHERE id = '${form}'`,
    ],
  ])('%s encerra o par sem alerta', async (_, update) => {
    const { patient, form } = await monitoredPatient(A, '3 days');

    await dataSource.query(update(form.id));
    await sweep.execute();

    expect(await absencesOf(patient, form.id)).toHaveLength(0);
    expect(await monitorsOf(patient, form.id)).toEqual([
      expect.objectContaining({ status: 'ended' }),
    ]);
  });

  it('paciente fora da lista encerra o par', async () => {
    const patient = await seed.patient(A);
    const form = await seed.form(A, { patients: [patient] });

    await sweep.execute();
    await startedAgo(patient, form.id, '3 days');
    await dataSource.query(
      'UPDATE follow_up_form_patients SET deleted_at = now() WHERE form_id = $1',
      [form.id],
    );
    await sweep.execute();

    expect(await absencesOf(patient, form.id)).toHaveLength(0);
    expect((await monitorsOf(patient, form.id))[0].status).toBe('ended');
  });

  it('paciente inativado e reativado recomeca a contagem do zero', async () => {
    const { patient, form } = await monitoredPatient(A, '3 days');

    await dataSource.query(
      "UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1",
      [patient],
    );
    await sweep.execute();
    await dataSource.query(
      "UPDATE patients SET status = 'active', deleted_at = NULL WHERE id = $1",
      [patient],
    );
    await sweep.execute();

    const monitors = await monitorsOf(patient, form.id);

    expect(monitors.map((monitor) => monitor.status)).toEqual([
      'ended',
      'active',
    ]);
    expect(await absencesOf(patient, form.id)).toHaveLength(0);
  });

  it('paciente inativado entre o fechamento e o disparo nao gera alerta', async () => {
    const { patient, form } = await monitoredPatient(A, '3 days');
    const repository = new AbsenceMonitorRepository(dataSource);
    const [monitor] = await monitorsOf(patient, form.id);

    await dataSource.query(
      "UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1",
      [patient],
    );

    expect(
      await repository.dispatch(A.id, monitor.id, await repository.now()),
    ).toEqual({ kind: 'skipped' });
    expect(await absencesOf(patient, form.id)).toHaveLength(0);
    expect((await monitorsOf(patient, form.id))[0].status).toBe('ended');
  });

  it('depois de uma queda de tres dias gera os tres periodos vencidos', async () => {
    const { patient, form } = await monitoredPatient(A, '3 days 1 minute');

    await sweep.execute();

    expect(await absencesOf(patient, form.id)).toHaveLength(3);
  });

  it('limita a cinquenta por par e por execucao e entrega o resto na seguinte', async () => {
    const { patient, form } = await monitoredPatient(A, '60 hours 1 minute', {
      interval: 1,
      unit: 'hours',
    });

    await sweep.execute();
    expect(await absencesOf(patient, form.id)).toHaveLength(50);

    await sweep.execute();
    expect(await absencesOf(patient, form.id)).toHaveLength(60);
  });

  it('cada alerta fica na organizacao e no paciente do par', async () => {
    const a = await monitoredPatient(A, '25 hours');
    const b = await monitoredPatient(B, '25 hours');

    await sweep.execute();

    expect(await absencesOf(a.patient, a.form.id)).toEqual([
      expect.objectContaining({ organizationId: A.id, formId: a.form.id }),
    ]);
    expect(await absencesOf(b.patient, b.form.id)).toEqual([
      expect.objectContaining({ organizationId: B.id, formId: b.form.id }),
    ]);
  });
});
