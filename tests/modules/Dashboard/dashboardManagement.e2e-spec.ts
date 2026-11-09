import { EvaluateFollowUpAlertsUseCase } from '@/modules/Alert/EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { DashboardController } from '@/modules/Dashboard/dashboard.controller';
import {
  DASHBOARD_REPOSITORIES,
  DASHBOARD_USE_CASES,
} from '@/modules/Dashboard/dashboard.module';
import { FollowUpController } from '@/modules/FollowUp/followUp.controller';
import { FOLLOW_UP_USE_CASES } from '@/modules/FollowUp/followUp.module';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import { FormController } from '@/modules/Form/form.controller';
import { FORM_USE_CASES } from '@/modules/Form/form.module';
import { FormRepository } from '@/modules/Form/repositories/form.repository';
import type { DashboardDto } from '@/modules/Dashboard/GetDashboard/getDashboard.dto';
import type { DashboardAlertsDto } from '@/modules/Dashboard/GetDashboardAlerts/getDashboardAlerts.dto';
import type { DashboardFollowUpsDto } from '@/modules/Dashboard/GetDashboardFollowUps/getDashboardFollowUps.dto';
import type { DashboardPatientsDto } from '@/modules/Dashboard/GetDashboardPatients/getDashboardPatients.dto';

import {
  bootNotificationApp,
  type NotificationApp,
  type Tenant,
} from '../Notification/notificationApp.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface FormBody {
  id: string;
  currentVersion: { id: string; fields: Array<{ id: string; name: string }> };
}

const OCTOBER = 'from=2026-10-01&to=2026-10-31';

describeWithDatabase('painel operacional (e2e)', () => {
  let t: NotificationApp;
  let A: Tenant;
  let B: Tenant;
  const ids: Record<string, string> = {};

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;

  const dashboard = (token: string, path = '', query = OCTOBER) =>
    t.http('get', `/dashboard${path}?${query}`, token);

  const newForm = async (tenant: Tenant, name: string): Promise<FormBody> => {
    const created = await t.http('post', '/forms', tenant.tokens.professional, {
      name,
      audience: 'organization',
      fields: [
        {
          name: 'Glicemia',
          fieldType: 'number',
          requirement: 'optional',
          unit: 'mg/dL',
          decimalPlaces: 0,
        },
      ],
    });

    expect(created.status).toBe(201);

    const published = await t.http(
      'post',
      `/forms/${dataOf<FormBody>(created).id}/publish`,
      tenant.tokens.professional,
      { confirmImpact: false },
    );

    expect(published.status).toBe(200);

    return dataOf<FormBody>(published);
  };

  const submit = async (
    token: string,
    patientId: string,
    form: FormBody,
    visitedAt: string,
  ): Promise<string> => {
    const response = await t.http('post', '/follow-ups', token, {
      patientId,
      formId: form.id,
      formVersionId: form.currentVersion.id,
      visitedAt,
      answers: [{ fieldId: form.currentVersion.fields[0].id, value: 120 }],
    });

    expect(response.status).toBe(201);

    return dataOf<{ id: string }>(response).id;
  };

  const absenceAlert = (
    tenant: Tenant,
    patientId: string,
    formId: string,
    severity: string,
    generatedAt: string,
  ) =>
    t.scalar(
      `INSERT INTO alerts
         (organization_id, patient_id, source, form_id, title, message, severity,
          absence_since, due_at, frequency_interval, frequency_unit, generated_at)
       VALUES ($1, $2, 'absence', $3, 'Ausência de registro', 'Sem registro.', $4,
               $5::timestamptz - interval '1 day', $5, 1, 'days', $5)
       RETURNING id AS value`,
      [tenant.id, patientId, formId, severity, generatedAt],
    );

  /**
   * A, visitas em UTC-3: r0 30/09 23:59 (periodo anterior), r1 01/10 00:00,
   * r2 10/10, r6 15/10 (outro formulario e cuidador), r3 31/10 23:59, r4
   * 01/11 00:00 (fora) e r5 20/10 anulado. Alertas: a1 leitura critica 01/10,
   * a2 ausencia warning 10/10, a3 info 31/10 resolvido, a4 critico 20/09
   * (anterior), a6 warning 10/10 de paciente inativo. B tem mais dados.
   */
  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!, {
      controllers: [FormController, FollowUpController, DashboardController],
      providers: [
        ...FORM_USE_CASES,
        FormRepository,
        ...FOLLOW_UP_USE_CASES,
        FollowUpRepository,
        {
          provide: EvaluateFollowUpAlertsUseCase,
          useValue: { afterSubmit: jest.fn().mockResolvedValue(undefined) },
        },
        ...DASHBOARD_USE_CASES,
        ...DASHBOARD_REPOSITORIES,
      ],
    });
    ({ A, B } = t.tenants);

    await t.dataSource.query(
      `UPDATE usage_plans SET features = ARRAY['patient_management', 'operational_dashboard']`,
    );

    const p1 = await t.linkedPatient(A, 'Paciente Um');
    const p2 = await t.linkedPatient(A, 'Paciente Dois');
    const p3 = await t.linkedPatient(A, 'Paciente Inativo');

    await t.dataSource.query(
      `UPDATE patients SET created_at = CASE id
                             WHEN $1::uuid THEN '2026-10-05T12:00:00Z'::timestamptz
                             WHEN $2::uuid THEN '2026-09-15T12:00:00Z'::timestamptz
                             ELSE '2026-10-06T12:00:00Z'::timestamptz END
        WHERE id IN ($1, $2, $3)`,
      [p1, p2, p3],
    );
    await t.dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, 'caregiver')`,
      [A.id, A.users.caregiver2, p2],
    );

    const vitals = await newForm(A, 'Sinais vitais');
    const routine = await newForm(A, 'Rotina');
    const caregiver = A.tokens.caregiver;

    await submit(caregiver, p1, vitals, '2026-10-01T02:59:00.000Z');
    ids.r1 = await submit(caregiver, p1, vitals, '2026-10-01T03:00:00.000Z');
    ids.r2 = await submit(caregiver, p2, vitals, '2026-10-10T15:00:00.000Z');
    ids.r3 = await submit(caregiver, p1, vitals, '2026-11-01T02:59:00.000Z');
    await submit(caregiver, p1, vitals, '2026-11-01T03:00:00.000Z');
    ids.r6 = await submit(
      A.tokens.caregiver2,
      p2,
      routine,
      '2026-10-15T12:00:00.000Z',
    );

    const r5 = await submit(caregiver, p2, vitals, '2026-10-20T12:00:00.000Z');
    const annulled = await t.http(
      'post',
      `/follow-ups/${r5}/annul`,
      A.tokens.professional,
      { reason: 'Digitado errado.' },
    );

    expect(annulled.status).toBe(200);

    await t.dataSource.query(
      `UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1`,
      [p3],
    );

    const fieldKey = (await t.scalar(
      'SELECT field_key::text AS value FROM follow_up_form_fields WHERE id = $1',
      [vitals.currentVersion.fields[0].id],
    ))!;
    const rule = (await t.scalar(
      `INSERT INTO alert_rules
         (organization_id, form_id, field_key, created_by_user_id, name,
          operator, reference_value, severity)
       VALUES ($1, $2, $3, $4, 'Glicemia alta', 'gt', 110, 'critical')
       RETURNING id AS value`,
      [A.id, vitals.id, fieldKey, A.users.professional],
    ))!;

    ids.a1 = (await t.scalar(
      `INSERT INTO alerts
         (organization_id, patient_id, source, rule_id, follow_up_record_id,
          response_item_id, title, message, severity, field_key, field_name,
          field_unit, value, operator, reference_value, generated_at)
       SELECT $1, $2, 'reading', $3, r.id, i.id, 'Glicemia alta', 'Valor acima.',
              'critical', $4, 'Glicemia', 'mg/dL', i.value, 'gt', 110,
              '2026-10-01T03:00:00Z'
         FROM follow_up_records r
         JOIN follow_up_responses resp ON resp.record_id = r.id
         JOIN follow_up_response_items i ON i.response_id = resp.id
        WHERE r.id = $5
       RETURNING id AS value`,
      [A.id, p1, rule, fieldKey, ids.r1],
    ))!;
    ids.a2 = (await absenceAlert(
      A,
      p2,
      vitals.id,
      'warning',
      '2026-10-10T12:00:00Z',
    ))!;
    ids.a3 = (await absenceAlert(
      A,
      p2,
      routine.id,
      'info',
      '2026-10-31T12:00:00Z',
    ))!;
    ids.a4 = (await absenceAlert(
      A,
      p1,
      routine.id,
      'critical',
      '2026-09-20T12:00:00Z',
    ))!;
    ids.a6 = (await absenceAlert(
      A,
      p3,
      vitals.id,
      'warning',
      '2026-10-10T13:00:00Z',
    ))!;

    await t.dataSource.query(
      `UPDATE alerts SET status = 'resolved', resolved_at = now(), resolved_by_user_id = $2
        WHERE id = $1`,
      [ids.a3, A.users.professional],
    );

    const profiles = await t.dataSource.query<
      Array<{ code: string; id: string }>
    >('SELECT code, id FROM access_profiles WHERE organization_id = $1', [
      A.id,
    ]);
    const profileId = (code: string) =>
      profiles.find((profile) => profile.code === code)!.id;

    await t.dataSource.query(
      `INSERT INTO users
         (organization_id, profile_id, name, email, cpf, status, password_hash,
          must_change_password, temporary_password_expires_at, deleted_at)
       VALUES ($1, $2, 'Convidado', 'convidado@a.test', '11144477735', 'pending',
               'x', true, now() + interval '1 day', NULL),
              ($1, $3, 'Ex-familiar', 'ex@a.test', '52998224725', 'inactive',
               'x', false, NULL, now())`,
      [A.id, profileId('professional'), profileId('family')],
    );

    const pb = await t.linkedPatient(B, 'Paciente B');
    const formB = await newForm(B, 'Sinais B');

    for (const day of ['02', '03', '04']) {
      await submit(
        B.tokens.caregiver,
        pb,
        formB,
        `2026-10-${day}T12:00:00.000Z`,
      );
    }

    await absenceAlert(B, pb, formB.id, 'critical', '2026-10-03T12:00:00Z');
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  it('resumo confere com os dados conhecidos, sem nada da outra organizacao', async () => {
    const response = await dashboard(A.tokens.admin);

    expect(response.status).toBe(200);
    expect((response.body as { meta: object }).meta).not.toHaveProperty(
      'message',
    );

    const data = dataOf<DashboardDto>(response);

    expect(data).toMatchObject({
      period: {
        from: '2026-10-01',
        to: '2026-10-31',
        timeZone: 'America/Sao_Paulo',
      },
      previousPeriod: { from: '2026-08-31', to: '2026-09-30' },
      patients: { active: 2, newInPeriod: 2 },
      users: { active: 5 },
      followUps: { inPeriod: 4, previousPeriodTotal: 1, change: 3 },
      alerts: {
        issuedInPeriod: 4,
        previousPeriodTotal: 1,
        change: 3,
        pending: 4,
      },
    });

    const byDay = data.followUps.byDay as Array<{
      date: string;
      total: number;
    }>;

    expect(byDay).toHaveLength(31);
    expect(byDay.filter((day) => day.total > 0)).toEqual([
      { date: '2026-10-01', total: 1 },
      { date: '2026-10-10', total: 1 },
      { date: '2026-10-15', total: 1 },
      { date: '2026-10-31', total: 1 },
    ]);
    expect(
      (data.priorityAlerts as Array<{ id: string }>).map((alert) => alert.id),
    ).toEqual([ids.a1, ids.a4, ids.a6, ids.a2]);
    expect(data.priorityAlerts[0]).toMatchObject({
      source: 'reading',
      severity: 'critical',
      patient: { name: 'Paciente Um' },
      reading: {
        fieldName: 'Glicemia',
        fieldUnit: 'mg/dL',
        value: '120',
        operator: 'gt',
        referenceValue: 110,
        author: { id: A.users.caregiver },
      },
    });
    expect(data.priorityAlerts[1]).toMatchObject({
      source: 'absence',
      reading: null,
    });
    expect(
      (data.latestFollowUps as Array<{ id: string }>).map((row) => row.id),
    ).toEqual([ids.r3, ids.r6, ids.r2, ids.r1]);
    expect(data.latestFollowUps[1]).toMatchObject({
      form: { name: 'Rotina' },
      author: { id: A.users.caregiver2 },
    });
  });

  it('detalhes conferem: pacientes, usuarios, registros e alertas', async () => {
    const patients = dataOf<DashboardPatientsDto>(
      await dashboard(A.tokens.admin, '/patients'),
    );

    expect(patients).toMatchObject({
      active: 2,
      inactive: 1,
      newInPeriod: 2,
      byResponsible: [
        { professional: { id: A.users.professional }, active: 2 },
      ],
    });

    const users = await t.http('get', '/dashboard/users', A.tokens.admin);

    expect(users.status).toBe(200);
    expect(dataOf(users)).toEqual({
      active: 5,
      pending: 1,
      inactive: 1,
      byProfile: [
        {
          profile: { code: 'admin', name: 'Administrador' },
          active: 1,
          pending: 0,
          inactive: 0,
        },
        {
          profile: {
            code: 'professional',
            name: expect.any(String) as unknown,
          },
          active: 1,
          pending: 1,
          inactive: 0,
        },
        {
          profile: { code: 'caregiver', name: expect.any(String) as unknown },
          active: 2,
          pending: 0,
          inactive: 0,
        },
        {
          profile: { code: 'family', name: expect.any(String) as unknown },
          active: 1,
          pending: 0,
          inactive: 1,
        },
      ],
    });

    const followUps = dataOf<DashboardFollowUpsDto>(
      await dashboard(A.tokens.admin, '/follow-ups'),
    );

    expect(followUps).toMatchObject({
      inPeriod: 4,
      previousPeriodTotal: 1,
      change: 3,
      byForm: [
        { form: { name: 'Sinais vitais' }, total: 3 },
        { form: { name: 'Rotina' }, total: 1 },
      ],
      byAuthor: [
        { user: { id: A.users.caregiver }, total: 3 },
        { user: { id: A.users.caregiver2 }, total: 1 },
      ],
    });
    expect(followUps.byDay).toHaveLength(31);

    const alerts = dataOf<DashboardAlertsDto>(
      await dashboard(A.tokens.admin, '/alerts'),
    );

    expect(alerts).toMatchObject({
      issuedInPeriod: 4,
      previousPeriodTotal: 1,
      change: 3,
      bySeverity: { critical: 1, warning: 2, info: 1 },
      bySource: { reading: 1, absence: 3, medication_reminder: 0 },
      issuedStillOpen: 3,
      pending: { total: 4, bySeverity: { critical: 2, warning: 2, info: 0 } },
    });
    expect(
      (alerts.byDay as Array<{ date: string; total: number }>).filter(
        (day) => day.total > 0,
      ),
    ).toEqual([
      { date: '2026-10-01', total: 1 },
      { date: '2026-10-10', total: 2 },
      { date: '2026-10-31', total: 1 },
    ]);
  });

  it('a outra organizacao ve so os proprios numeros', async () => {
    const data = dataOf<DashboardDto>(await dashboard(B.tokens.admin));

    expect(data).toMatchObject({
      patients: { active: 1 },
      users: { active: 5 },
      followUps: { inPeriod: 3, previousPeriodTotal: 0 },
      alerts: { issuedInPeriod: 1, pending: 1 },
    });
    expect(
      (data.latestFollowUps as Array<{ patient: { name: string } }>).every(
        (row) => row.patient.name === 'Paciente B',
      ),
    ).toBe(true);
  });

  it('periodo sem registro: zeros e aviso; o que e foto segue real', async () => {
    const response = await dashboard(
      A.tokens.admin,
      '',
      'from=2026-08-01&to=2026-08-01',
    );

    expect(response.status).toBe(200);
    expect(response.body as object).toMatchObject({
      data: {
        patients: { active: 2, newInPeriod: 0 },
        followUps: {
          inPeriod: 0,
          change: 0,
          byDay: [{ date: '2026-08-01', total: 0 }],
        },
        alerts: { issuedInPeriod: 0, pending: 4 },
        latestFollowUps: [],
      },
      meta: {
        message: 'Nenhum registro de acompanhamento no período selecionado.',
      },
    });
  });

  it('so admin; plano sem o recurso e 403; periodo invalido 422', async () => {
    for (const role of ['professional', 'caregiver', 'family'] as const) {
      expect((await dashboard(A.tokens[role])).status).toBe(403);
    }

    expect((await dashboard(t.masterToken)).status).toBe(403);
    expect(
      (await dashboard(A.tokens.admin, '', 'from=2026-10-31&to=2026-10-01'))
        .status,
    ).toBe(422);

    await t.dataSource.query(
      `UPDATE usage_plans SET features = ARRAY['patient_management']`,
    );

    try {
      for (const path of [
        '',
        '/patients',
        '/users',
        '/follow-ups',
        '/alerts',
      ]) {
        const response = await dashboard(A.tokens.admin, path);

        expect(response.status).toBe(403);
        expect(response.body as object).toMatchObject({
          error: { code: 'DASHBOARD_PLAN_FEATURE_UNAVAILABLE' },
        });
      }
    } finally {
      await t.dataSource.query(
        `UPDATE usage_plans SET features = ARRAY['patient_management', 'operational_dashboard']`,
      );
    }
  });
});
