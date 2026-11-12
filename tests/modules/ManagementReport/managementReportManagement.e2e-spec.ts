import request from 'supertest';
import type { App } from 'supertest/types';

import { EvaluateFollowUpAlertsUseCase } from '@/modules/Alert/EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { DashboardController } from '@/modules/Dashboard/dashboard.controller';
import {
  DASHBOARD_REPOSITORIES,
  DASHBOARD_USE_CASES,
} from '@/modules/Dashboard/dashboard.module';
import type { DashboardDto } from '@/modules/Dashboard/GetDashboard/getDashboard.dto';
import type { DashboardAlertsDto } from '@/modules/Dashboard/GetDashboardAlerts/getDashboardAlerts.dto';
import { FollowUpController } from '@/modules/FollowUp/followUp.controller';
import { FOLLOW_UP_USE_CASES } from '@/modules/FollowUp/followUp.module';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import { FormController } from '@/modules/Form/form.controller';
import { FORM_USE_CASES } from '@/modules/Form/form.module';
import { FormRepository } from '@/modules/Form/repositories/form.repository';
import type { AlertsReportDto } from '@/modules/ManagementReport/GetAlertsReport/getAlertsReport.dto';
import type { CaregiverActivityReportDto } from '@/modules/ManagementReport/GetCaregiverActivityReport/getCaregiverActivityReport.dto';
import type { ManagementReportTypeDto } from '@/modules/ManagementReport/ListManagementReportTypes/listManagementReportTypes.dto';
import type { RecentReportDto } from '@/modules/ManagementReport/ListRecentReports/listRecentReports.dto';
import { ManagementReportController } from '@/modules/ManagementReport/managementReport.controller';
import {
  MANAGEMENT_REPORT_REPOSITORIES,
  MANAGEMENT_REPORT_SERVICES,
  MANAGEMENT_REPORT_USE_CASES,
} from '@/modules/ManagementReport/managementReport.module';
import { ManagementReportPdfService } from '@/modules/ManagementReport/services/managementReportPdf.service';

import {
  bootNotificationApp,
  type NotificationApp,
  type Tenant,
} from '../Notification/notificationApp.fixtures';
import { extractPdfText } from '../Report/pdfText';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface FormBody {
  id: string;
  name: string;
  currentVersion: { id: string; fields: Array<{ id: string }> };
}

const OCTOBER = 'from=2026-10-01&to=2026-10-31';
const ROUTES = [
  '',
  '/recent',
  '/alerts',
  '/alerts/pdf',
  '/caregivers',
  '/caregivers/pdf',
];

describeWithDatabase('relatorios gerenciais (e2e)', () => {
  let t: NotificationApp;
  let A: Tenant;
  let B: Tenant;
  let form: FormBody;
  const p: Record<string, string> = {};
  const a: Record<string, string> = {};

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;

  const messageOf = (response: { body: unknown }) =>
    (response.body as { meta: { message?: string } }).meta.message;

  const report = (token: string, path: string, query = OCTOBER) =>
    t.http('get', `/management-reports${path}?${query}`, token);

  const pdf = (token: string, path: string, query = OCTOBER) =>
    request(t.app.getHttpServer() as App)
      .get(`/api/v1/management-reports${path}/pdf?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  const exports = (tenant: Tenant) =>
    t.dataSource.query<Array<{ actor: string; after: object }>>(
      `SELECT actor_user_id AS actor, after_values AS after
         FROM audit_events
        WHERE organization_id = $1 AND action = 'management_report.exported'
        ORDER BY occurred_at, id`,
      [tenant.id],
    );

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
    visitedAt: string,
    target: FormBody = form,
  ): Promise<string> => {
    const response = await t.http('post', '/follow-ups', token, {
      patientId,
      formId: target.id,
      formVersionId: target.currentVersion.id,
      visitedAt,
      answers: [{ fieldId: target.currentVersion.fields[0].id, value: 150 }],
    });

    expect(response.status).toBe(201);

    return dataOf<{ id: string }>(response).id;
  };

  const absenceAlert = async (
    tenant: Tenant,
    patientId: string,
    formId: string,
    severity: string,
    generatedAt: string,
  ) =>
    (await t.scalar(
      `INSERT INTO alerts
         (organization_id, patient_id, source, form_id, title, message, severity,
          absence_since, due_at, frequency_interval, frequency_unit, generated_at)
       VALUES ($1, $2, 'absence', $3, 'Ausência de registro', 'Sem registro.', $4,
               $5::timestamptz - interval '1 day', $5, 1, 'days', $5)
       RETURNING id AS value`,
      [tenant.id, patientId, formId, severity, generatedAt],
    ))!;

  const resolve = (alert: string, user: string, at: string) =>
    t.dataSource.query(
      `UPDATE alerts SET status = 'resolved', resolved_at = $3, resolved_by_user_id = $2
        WHERE id = $1`,
      [alert, user, at],
    );

  /**
   * Organizacao A, outubro de 2026 (UTC-3):
   * - p1 "Ana" (Diabetes tipo 2), p2 "Bruno" (DPOC + Hipertensao arterial),
   *   p3 "Clara" (sem condicao), p4 "Diego" (Diabetes, inativado);
   * - cuidador: vinculo desde 01/09 com p1, p2 e p4; r1 05/10 e r2 20/10
   *   validos em p1, r3 12/10 anulado em p2, um valido em 30/09 e outro em
   *   01/11 (fora);
   * - cuidador2: vinculo com p3 de 01/09 a 15/10, r5 valido em 08/10, depois
   *   inativado;
   * - alertas: a1 leitura critica p1 05/10 resolvida pelo cuidador em 2 h; a2
   *   ausencia warning p2 10/10 aberta; a3 ausencia critica p3 20/10 (depois
   *   da revogacao) resolvida pelo admin em 02/11; a4 ausencia warning p3
   *   10/10 aberta; a5 lembrete info p1 15/10 resolvido pelo cuidador em 1 h;
   *   a6 ausencia critica p4 25/10 aberta; a7 (20/09) e a8 (01/11) fora.
   * B tem paciente, registros e alertas proprios.
   */
  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!, {
      controllers: [
        FormController,
        FollowUpController,
        DashboardController,
        ManagementReportController,
      ],
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
        ...MANAGEMENT_REPORT_USE_CASES,
        ...MANAGEMENT_REPORT_SERVICES,
        ...MANAGEMENT_REPORT_REPOSITORIES,
      ],
    });
    ({ A, B } = t.tenants);

    await t.dataSource.query(
      `UPDATE usage_plans
          SET features = ARRAY['patient_management', 'operational_dashboard', 'management_reports']`,
    );

    p.ana = await t.linkedPatient(A, 'Ana Sintetica');
    p.bruno = await t.linkedPatient(A, 'Bruno Sintetico');
    p.diego = await t.linkedPatient(A, 'Diego Sintetico');
    p.clara = (await t.scalar(
      `INSERT INTO patients (organization_id, name, birth_date)
       VALUES ($1, 'Clara Sintetica', '1950-01-01') RETURNING id AS value`,
      [A.id],
    ))!;
    await t.dataSource.query(
      `UPDATE patients SET main_condition = CASE id
                             WHEN $1::uuid THEN 'Diabetes tipo 2'
                             WHEN $2::uuid THEN 'DPOC'
                             WHEN $3::uuid THEN 'Diabetes' END,
                           secondary_conditions = CASE id
                             WHEN $2::uuid THEN ARRAY['Hipertensão arterial']
                             ELSE '{}'::text[] END
        WHERE id IN ($1, $2, $3)`,
      [p.ana, p.bruno, p.diego],
    );
    await t.dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, 'caregiver')`,
      [A.id, A.users.caregiver2, p.clara],
    );
    await t.dataSource.query(
      `UPDATE user_patients SET created_at = '2026-09-01T12:00:00Z'
        WHERE organization_id = $1`,
      [A.id],
    );

    form = await newForm(A, 'Sinais vitais');

    const caregiver = A.tokens.caregiver;
    const r1 = await submit(caregiver, p.ana, '2026-10-05T12:00:00.000Z');

    await submit(caregiver, p.ana, '2026-10-20T12:00:00.000Z');
    await submit(caregiver, p.ana, '2026-09-30T12:00:00.000Z');
    await submit(caregiver, p.ana, '2026-11-01T03:00:00.000Z');

    const r3 = await submit(caregiver, p.bruno, '2026-10-12T12:00:00.000Z');

    expect(
      (
        await t.http('post', `/follow-ups/${r3}/annul`, A.tokens.professional, {
          reason: 'Paciente errado.',
        })
      ).status,
    ).toBe(200);

    await submit(A.tokens.caregiver2, p.clara, '2026-10-08T12:00:00.000Z');
    await t.dataSource.query(
      `UPDATE user_patients SET deleted_at = '2026-10-15T12:00:00Z'
        WHERE user_id = $1 AND patient_id = $2`,
      [A.users.caregiver2, p.clara],
    );

    const fieldKey = (await t.scalar(
      'SELECT field_key::text AS value FROM follow_up_form_fields WHERE id = $1',
      [form.currentVersion.fields[0].id],
    ))!;
    const rule = (await t.scalar(
      `INSERT INTO alert_rules
         (organization_id, form_id, field_key, created_by_user_id, name,
          operator, reference_value, severity)
       VALUES ($1, $2, $3, $4, 'Glicemia alta', 'gt', 110, 'critical')
       RETURNING id AS value`,
      [A.id, form.id, fieldKey, A.users.professional],
    ))!;

    a.a1 = (await t.scalar(
      `INSERT INTO alerts
         (organization_id, patient_id, source, rule_id, follow_up_record_id,
          response_item_id, title, message, severity, field_key, field_name,
          field_unit, value, operator, reference_value, generated_at)
       SELECT $1, $2, 'reading', $3, r.id, i.id, 'Glicemia alta', 'Valor acima.',
              'critical', $4, 'Glicemia', 'mg/dL', i.value, 'gt', 110,
              '2026-10-05T12:00:00Z'
         FROM follow_up_records r
         JOIN follow_up_responses resp ON resp.record_id = r.id
         JOIN follow_up_response_items i ON i.response_id = resp.id
        WHERE r.id = $5
       RETURNING id AS value`,
      [A.id, p.ana, rule, fieldKey, r1],
    ))!;
    await resolve(a.a1, A.users.caregiver, '2026-10-05T14:00:00Z');

    a.a2 = await absenceAlert(
      A,
      p.bruno,
      form.id,
      'warning',
      '2026-10-10T12:00:00Z',
    );
    a.a3 = await absenceAlert(
      A,
      p.clara,
      form.id,
      'critical',
      '2026-10-20T12:00:00Z',
    );
    await resolve(a.a3, A.users.admin, '2026-11-02T12:00:00Z');
    a.a4 = await absenceAlert(
      A,
      p.clara,
      form.id,
      'warning',
      '2026-10-10T12:00:00Z',
    );

    const medication = (await t.scalar(
      `INSERT INTO medications
         (organization_id, patient_id, created_by_user_id, name, dose_amount,
          dose_unit, reminders_enabled)
       VALUES ($1, $2, $3, 'Losartana', 50, 'mg', true) RETURNING id AS value`,
      [A.id, p.ana, A.users.professional],
    ))!;
    const reminder = (await t.scalar(
      `INSERT INTO medication_reminders
         (organization_id, medication_id, start_date, interval_days, time_of_day)
       VALUES ($1, $2, '2026-10-01', 1, '08:00') RETURNING id AS value`,
      [A.id, medication],
    ))!;

    a.a5 = (await t.scalar(
      `INSERT INTO alerts
         (organization_id, patient_id, source, medication_id,
          medication_reminder_id, scheduled_at, title, message, severity,
          generated_at)
       VALUES ($1, $2, 'medication_reminder', $3, $4, '2026-10-15T11:00:00Z',
               'Lembrete', 'Hora do medicamento.', 'info', '2026-10-15T11:00:00Z')
       RETURNING id AS value`,
      [A.id, p.ana, medication, reminder],
    ))!;
    await resolve(a.a5, A.users.caregiver, '2026-10-15T12:00:00Z');

    a.a6 = await absenceAlert(
      A,
      p.diego,
      form.id,
      'critical',
      '2026-10-25T12:00:00Z',
    );
    await absenceAlert(A, p.ana, form.id, 'warning', '2026-09-20T12:00:00Z');
    await absenceAlert(A, p.bruno, form.id, 'info', '2026-11-01T03:00:00Z');

    await t.dataSource.query(
      `UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1`,
      [p.diego],
    );
    await t.dataSource.query(
      `UPDATE users SET status = 'inactive', deleted_at = now() WHERE id = $1`,
      [A.users.caregiver2],
    );

    const pb = await t.linkedPatient(B, 'Paciente da Outra');
    const formB = await newForm(B, 'Sinais B');

    await t.dataSource.query(
      `UPDATE user_patients SET created_at = '2026-09-01T12:00:00Z'
        WHERE organization_id = $1`,
      [B.id],
    );
    await submit(B.tokens.caregiver, pb, '2026-10-03T12:00:00.000Z', formB);
    await absenceAlert(B, pb, formB.id, 'critical', '2026-10-03T12:00:00Z');
    await absenceAlert(B, pb, formB.id, 'info', '2026-10-04T12:00:00Z');
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  it('alertas: numeros conferem com os dados montados e com o painel', async () => {
    const response = await report(A.tokens.admin, '/alerts');

    expect(response.status).toBe(200);
    expect(messageOf(response)).toBeUndefined();

    const data = dataOf<AlertsReportDto>(response);

    expect(data).toMatchObject({
      period: { from: '2026-10-01', to: '2026-10-31' },
      condition: null,
      organization: { id: A.id },
      totals: { issued: 6, open: 3, resolved: 3, intercurrences: 3 },
      bySource: {
        reading: { total: 1, open: 0, resolved: 1 },
        absence: { total: 4, open: 3, resolved: 1 },
        medicationReminder: { total: 1, open: 0, resolved: 1 },
      },
      bySeverity: {
        critical: { total: 3, open: 1, resolved: 2 },
        warning: { total: 2, open: 2, resolved: 0 },
        info: { total: 1, open: 0, resolved: 1 },
      },
      resolution: {
        overall: { resolved: 3, averageHours: 105, medianHours: 2 },
        bySeverity: {
          critical: { resolved: 2, averageHours: 157, medianHours: 157 },
          warning: { resolved: 0, averageHours: null, medianHours: null },
          info: { resolved: 1, averageHours: 1, medianHours: 1 },
        },
      },
      intercurrencesTruncated: false,
    });
    expect(
      data.topPatients.map((row) => [
        row.patient.name,
        row.patient.status,
        row.total,
        row.intercurrences,
        row.open,
      ]),
    ).toEqual([
      ['Ana Sintetica', 'active', 2, 1, 0],
      ['Clara Sintetica', 'active', 2, 1, 1],
      ['Diego Sintetico', 'inactive', 1, 1, 1],
      ['Bruno Sintetico', 'active', 1, 0, 1],
    ]);
    expect(data.byDay).toHaveLength(31);
    expect(data.byDay.filter((day) => day.total > 0)).toEqual([
      { date: '2026-10-05', total: 1, intercurrences: 1 },
      { date: '2026-10-10', total: 2, intercurrences: 0 },
      { date: '2026-10-15', total: 1, intercurrences: 0 },
      { date: '2026-10-20', total: 1, intercurrences: 1 },
      { date: '2026-10-25', total: 1, intercurrences: 1 },
    ]);
    expect(
      data.intercurrences.map((row) => [
        row.id,
        row.subject,
        row.hoursToResolve,
      ]),
    ).toEqual([
      [a.a6, 'Sinais vitais', null],
      [a.a3, 'Sinais vitais', 312],
      [a.a1, 'Glicemia', 2],
    ]);
    expect(JSON.stringify(data)).not.toMatch(
      /"value"|referenceValue|"operator"/,
    );

    const dashboard = dataOf<DashboardDto>(
      await t.http('get', `/dashboard?${OCTOBER}`, A.tokens.admin),
    );
    const dashboardAlerts = dataOf<DashboardAlertsDto>(
      await t.http('get', `/dashboard/alerts?${OCTOBER}`, A.tokens.admin),
    );

    expect(data.totals.issued).toBe(dashboard.alerts.issuedInPeriod);
    expect(data.totals.open).toBe(dashboardAlerts.issuedStillOpen);
  });

  it('cuidadores: medidas conferem e somam os registros validos do painel', async () => {
    const response = await report(A.tokens.admin, '/caregivers');

    expect(response.status).toBe(200);

    const data = dataOf<CaregiverActivityReportDto>(response);
    const byId = Object.fromEntries(
      data.caregivers.map((row) => [row.caregiver.id, row]),
    );

    expect(data.caregivers).toHaveLength(2);
    expect(byId[A.users.caregiver]).toMatchObject({
      caregiver: { status: 'active', profile: 'caregiver' },
      linkedPatients: 3,
      validFollowUps: 2,
      annulledFollowUps: 1,
      patientsWithFollowUp: 1,
      patientsWithoutFollowUp: 2,
      absenceAlerts: 2,
      resolvedAlerts: 2,
    });
    expect(byId[A.users.caregiver2]).toMatchObject({
      caregiver: { status: 'inactive', profile: 'caregiver' },
      linkedPatients: 1,
      validFollowUps: 1,
      annulledFollowUps: 0,
      patientsWithFollowUp: 1,
      patientsWithoutFollowUp: 0,
      absenceAlerts: 1,
      resolvedAlerts: 0,
    });
    expect(data.summary).toEqual({
      caregivers: 2,
      linkedPatients: 4,
      validFollowUps: 3,
      annulledFollowUps: 1,
      absenceAlerts: 3,
      resolvedAlerts: 2,
    });

    const dashboard = dataOf<DashboardDto>(
      await t.http('get', `/dashboard?${OCTOBER}`, A.tokens.admin),
    );

    expect(data.summary.validFollowUps).toBe(dashboard.followUps.inPeriod);
  });

  it('condicao filtra pela principal ou secundaria, sem diferenciar maiusculas', async () => {
    const diab = dataOf<AlertsReportDto>(
      await report(A.tokens.admin, '/alerts', `${OCTOBER}&condition=diab`),
    );

    expect(diab.condition).toBe('diab');
    expect(diab.totals).toEqual({
      issued: 3,
      open: 1,
      resolved: 2,
      intercurrences: 2,
    });
    expect(diab.topPatients.map((row) => row.patient.name)).toEqual([
      'Ana Sintetica',
      'Diego Sintetico',
    ]);

    const hipert = dataOf<AlertsReportDto>(
      await report(A.tokens.admin, '/alerts', `${OCTOBER}&condition=HIPERT`),
    );

    expect(hipert.totals.issued).toBe(1);
    expect(hipert.topPatients[0].patient.name).toBe('Bruno Sintetico');

    const wildcard = dataOf<AlertsReportDto>(
      await report(A.tokens.admin, '/alerts', `${OCTOBER}&condition=%25`),
    );

    expect(wildcard.totals.issued).toBe(0);

    const caregivers = dataOf<CaregiverActivityReportDto>(
      await report(A.tokens.admin, '/caregivers', `${OCTOBER}&condition=diab`),
    );

    expect(caregivers.caregivers).toHaveLength(1);
    expect(caregivers.caregivers[0]).toMatchObject({
      caregiver: { id: A.users.caregiver },
      linkedPatients: 2,
      validFollowUps: 2,
      annulledFollowUps: 0,
      patientsWithFollowUp: 1,
      absenceAlerts: 1,
      resolvedAlerts: 2,
    });
  });

  it('periodo sem dados: 200 com zeros e mensagem', async () => {
    const august = 'from=2026-08-01&to=2026-08-31';
    const alerts = await report(A.tokens.admin, '/alerts', august);
    const caregivers = await report(A.tokens.admin, '/caregivers', august);

    expect(alerts.status).toBe(200);
    expect(messageOf(alerts)).toBe(
      'Nenhum alerta emitido no período selecionado.',
    );
    expect(dataOf<AlertsReportDto>(alerts).totals.issued).toBe(0);
    expect(caregivers.status).toBe(200);
    expect(messageOf(caregivers)).toBe(
      'Nenhuma atividade de cuidador no período selecionado.',
    );
    expect(dataOf<CaregiverActivityReportDto>(caregivers).caregivers).toEqual(
      [],
    );
  });

  it('a outra organizacao ve so os proprios numeros', async () => {
    const alerts = dataOf<AlertsReportDto>(
      await report(B.tokens.admin, '/alerts'),
    );
    const caregivers = dataOf<CaregiverActivityReportDto>(
      await report(B.tokens.admin, '/caregivers'),
    );

    expect(alerts.organization.id).toBe(B.id);
    expect(alerts.totals).toMatchObject({ issued: 2, intercurrences: 1 });
    expect(caregivers.caregivers.map((row) => row.caregiver.id)).toEqual([
      B.users.caregiver,
    ]);
    expect(JSON.stringify([alerts, caregivers])).not.toMatch(
      /Ana Sintetica|Bruno|Clara|Diego/,
    );
  });

  it('PDF confere com o JSON, sai sem cache e grava a exportacao na auditoria', async () => {
    const before = (await exports(A)).length;
    const alerts = await pdf(
      A.tokens.admin,
      '/alerts',
      `${OCTOBER}&condition=diab`,
    );

    expect(alerts.status).toBe(200);
    expect(alerts.headers['content-type']).toBe('application/pdf');
    expect(alerts.headers['cache-control']).toBe('private, no-store');
    expect(alerts.headers['content-disposition']).toBe(
      'attachment; filename="relatorio-alertas-2026-10-01-a-2026-10-31.pdf"',
    );

    const alertsText = (await extractPdfText(alerts.body as Buffer))
      .join('\n')
      .toLowerCase();

    for (const expected of [
      'alertas e intercorrências',
      'condição: diab',
      'ana sintetica',
      'diego sintetico',
      'glicemia',
      'página 1 de',
    ]) {
      expect(alertsText).toContain(expected);
    }
    expect(alertsText).not.toContain('bruno sintetico');

    const caregivers = await pdf(A.tokens.admin, '/caregivers');

    expect(caregivers.status).toBe(200);
    expect(caregivers.headers['content-disposition']).toBe(
      'attachment; filename="relatorio-atividade-cuidadores-2026-10-01-a-2026-10-31.pdf"',
    );
    expect(
      (await extractPdfText(caregivers.body as Buffer)).join('\n'),
    ).toContain('Usuario cuidador2');

    const events = await exports(A);

    expect(events.slice(before)).toEqual([
      {
        actor: A.users.admin,
        after: {
          type: 'alerts',
          format: 'pdf',
          from: '2026-10-01',
          to: '2026-10-31',
          condition: 'diab',
        },
      },
      {
        actor: A.users.admin,
        after: {
          type: 'caregiver_activity',
          format: 'pdf',
          from: '2026-10-01',
          to: '2026-10-31',
          condition: null,
        },
      },
    ]);
  });

  it('falha na geracao do PDF: 500 sem auditoria; a nova tentativa gera e audita', async () => {
    const service = t.app.get(ManagementReportPdfService);
    const before = (await exports(A)).length;
    const spy = jest
      .spyOn(service as unknown as { draw: () => Promise<Buffer> }, 'draw')
      .mockRejectedValueOnce(new Error('pdfkit quebrou'));

    const failed = await report(A.tokens.admin, '/alerts/pdf');

    expect(failed.status).toBe(500);
    expect(failed.body as object).toMatchObject({
      error: { code: 'MANAGEMENT_REPORT_EXPORT_FAILED', detail: null },
    });
    expect((await exports(A)).length).toBe(before);

    spy.mockRestore();
    expect((await pdf(A.tokens.admin, '/alerts')).status).toBe(200);
    expect((await exports(A)).length).toBe(before + 1);
  });

  it('catalogo e recentes vem das exportacoes auditadas, sem as leituras em JSON', async () => {
    await insertAuditEvent(t.dataSource.manager, {
      organizationId: A.id,
      actorUserId: A.users.professional,
      action: 'patient_report.exported',
      entityType: 'patient',
      entityId: p.ana,
      afterValues: { from: '2026-09-01', to: '2026-09-30' },
      requestId: null,
    });

    const types = dataOf<ManagementReportTypeDto[]>(
      await t.http('get', '/management-reports', A.tokens.admin),
    );

    expect(
      Object.fromEntries(types.map((type) => [type.type, type.exportCount])),
    ).toEqual({ patient_follow_up: 1, alerts: 2, caregiver_activity: 1 });

    const recent = await t.http(
      'get',
      '/management-reports/recent?limit=2',
      A.tokens.admin,
    );
    const items = dataOf<RecentReportDto[]>(recent);

    expect(
      (recent.body as { meta: { pagination: object } }).meta.pagination,
    ).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    expect(items[0]).toMatchObject({
      type: 'patient_follow_up',
      scope: {
        kind: 'patient',
        patient: { id: p.ana, name: 'Ana Sintetica' },
      },
      period: { from: '2026-09-01', to: '2026-09-30' },
      generatedBy: { id: A.users.professional },
    });
    expect(items[1]).toMatchObject({
      type: 'alerts',
      scope: { kind: 'all', patient: null, condition: null },
      generatedBy: { id: A.users.admin, name: `Admin ${A.code}` },
    });

    const emptyB = await t.http(
      'get',
      '/management-reports/recent',
      B.tokens.admin,
    );

    expect(dataOf<RecentReportDto[]>(emptyB)).toEqual([]);
    expect(messageOf(emptyB)).toBe('Nenhum relatório exportado ainda.');
  });

  it('so admin; plano sem o recurso e 403 antes de qualquer dado; periodo invalido 422', async () => {
    for (const role of ['professional', 'caregiver', 'family'] as const) {
      for (const path of ROUTES) {
        expect((await report(A.tokens[role], path)).status).toBe(403);
      }
    }
    expect((await report(t.masterToken, '/alerts')).status).toBe(403);

    for (const query of ['from=2025-01-01&to=2026-01-02', 'condition=']) {
      expect((await report(A.tokens.admin, '/alerts', query)).status).toBe(422);
    }

    await t.dataSource.query(
      `UPDATE usage_plans SET features = ARRAY['patient_management', 'operational_dashboard']`,
    );

    try {
      for (const path of ROUTES) {
        // Catalogo e recentes nao recebem periodo.
        const query = path === '' || path === '/recent' ? '' : OCTOBER;
        const response = await report(A.tokens.admin, path, query);

        expect(response.status).toBe(403);
        expect(response.body as object).toMatchObject({
          error: { code: 'MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE' },
        });
      }
    } finally {
      await t.dataSource.query(
        `UPDATE usage_plans
            SET features = ARRAY['patient_management', 'operational_dashboard', 'management_reports']`,
      );
    }
  });

  it('migration: down tira a permissao; up concede so ao admin das organizacoes cliente', async () => {
    const grants = () =>
      t.dataSource.query<Array<{ org: string; profile: string }>>(
        `SELECT o.code AS org, ap.code AS profile
           FROM profile_permissions pp
           JOIN permissions perm ON perm.id = pp.permission_id
           JOIN access_profiles ap ON ap.id = pp.profile_id
           JOIN organizations o ON o.id = ap.organization_id
          WHERE perm.code = 'management_reports:generate'
            AND pp.deleted_at IS NULL
          ORDER BY o.code, ap.code`,
      );

    await t.dataSource.undoLastMigration();

    try {
      expect(await grants()).toEqual([]);
      expect((await report(A.tokens.admin, '/alerts')).status).toBe(403);
    } finally {
      await t.dataSource.runMigrations();
    }

    expect(await grants()).toEqual([
      { org: A.code, profile: 'admin' },
      { org: B.code, profile: 'admin' },
    ]);
    expect((await report(A.tokens.admin, '/alerts')).status).toBe(200);
  });
});
