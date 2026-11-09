import request from 'supertest';
import type { App } from 'supertest/types';

import { EvaluateFollowUpAlertsUseCase } from '@/modules/Alert/EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { FollowUpController } from '@/modules/FollowUp/followUp.controller';
import { FOLLOW_UP_USE_CASES } from '@/modules/FollowUp/followUp.module';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import { FormController } from '@/modules/Form/form.controller';
import { FORM_USE_CASES } from '@/modules/Form/form.module';
import { FormRepository } from '@/modules/Form/repositories/form.repository';
import { IndicatorController } from '@/modules/Indicator/indicator.controller';
import {
  INDICATOR_REPOSITORIES,
  INDICATOR_USE_CASES,
} from '@/modules/Indicator/indicator.module';
import { MedicationController } from '@/modules/Medication/medication.controller';
import { MEDICATION_USE_CASES } from '@/modules/Medication/medication.module';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';
import { PatientRepository } from '@/modules/Patient/repositories/patient.repository';
import { ReportController } from '@/modules/Report/report.controller';
import {
  REPORT_PROVIDERS,
  REPORT_USE_CASES,
} from '@/modules/Report/report.module';
import { PatientReportPdfService } from '@/modules/Report/services/patientReportPdf.service';

import {
  bootNotificationApp,
  type NotificationApp,
  type Tenant,
} from '../Notification/notificationApp.fixtures';
import { extractPdfText } from './pdfText';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface FieldBody {
  id: string;
  name: string;
}

interface FormBody {
  id: string;
  currentVersion: { id: string; fields: FieldBody[] };
}

interface ReportBody {
  period: { from: string; to: string };
  patient: Record<string, unknown>;
  records: {
    total: number;
    items: Array<{ id: string }>;
    byAuthor: Array<{ total: number }>;
  };
  series: unknown[];
  medications: Array<{ id: string; name: string }>;
}

const VITALS = [
  {
    name: 'Glicemia capilar',
    fieldType: 'number',
    requirement: 'optional',
    section: 'Sinais vitais',
    unit: 'mg/dL',
    decimalPlaces: 0,
  },
  {
    name: 'Dor',
    fieldType: 'scale',
    requirement: 'optional',
    section: 'Bem-estar',
    scaleMin: 0,
    scaleMax: 10,
  },
  {
    name: 'Observacao',
    fieldType: 'text',
    requirement: 'optional',
    section: 'Sinais vitais',
  },
];

const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };

describeWithDatabase('relatorio do paciente e PDF (e2e)', () => {
  let t: NotificationApp;
  let pdfService: PatientReportPdfService;

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;
  const errorOf = (response: { body: unknown }) =>
    (response.body as { error: { code: string } }).error;

  const newForm = async (tenant: Tenant): Promise<FormBody> => {
    const created = await t.http('post', '/forms', tenant.tokens.professional, {
      name: 'Sinais vitais',
      audience: 'organization',
      fields: VITALS,
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
    tenant: Tenant,
    patientId: string,
    form: FormBody,
    values: Record<string, unknown>,
    visitedAt: string,
  ): Promise<string> => {
    const response = await t.http(
      'post',
      '/follow-ups',
      tenant.tokens.caregiver,
      {
        patientId,
        formId: form.id,
        formVersionId: form.currentVersion.id,
        visitedAt,
        answers: Object.entries(values).map(([name, value]) => ({
          fieldId: form.currentVersion.fields.find(
            (field) => field.name === name,
          )!.id,
          value,
        })),
      },
    );

    expect(response.status).toBe(201);

    return dataOf<{ id: string }>(response).id;
  };

  const report = (
    token: string,
    patientId: string,
    query: Record<string, string> = OCTOBER,
  ) =>
    t.http(
      'get',
      `/patients/${patientId}/report?${new URLSearchParams(query)}`,
      token,
    );

  const pdf = (
    token: string,
    patientId: string,
    query: Record<string, string> = OCTOBER,
  ) =>
    request(t.app.getHttpServer() as App)
      .get(
        `/api/v1/patients/${patientId}/report/pdf?${new URLSearchParams(query)}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  const pdfText = async (response: { body: unknown }) =>
    (await extractPdfText(response.body as Buffer)).join('\n');

  const exportsOf = (patientId: string) =>
    t.dataSource.query<
      Array<{ actorUserId: string; afterValues: Record<string, string> }>
    >(
      `SELECT actor_user_id AS "actorUserId", after_values AS "afterValues"
         FROM audit_events
        WHERE action = 'patient_report.exported'
          AND entity_type = 'patient'
          AND entity_id = $1
        ORDER BY created_at`,
      [patientId],
    );

  /** Cenario do BE-20: r1 fora de outubro, r2-r4 validos, r5 anulado. */
  const scenario = async (tenant: Tenant) => {
    const patientId = await t.linkedPatient(tenant, 'Maria Relatorio');

    await t.dataSource.query(
      `UPDATE patients SET phone = '11987654321',
              health_plan = 'Plano Sigiloso', main_condition = 'Hipertensao'
        WHERE id = $1`,
      [patientId],
    );

    const form = await newForm(tenant);

    await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 92 },
      '2026-10-01T02:59:00.000Z',
    );
    await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 105, Dor: 0, Observacao: 'Sem queixas' },
      '2026-10-01T03:00:00.000Z',
    );
    await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 98, Dor: 4 },
      '2026-10-10T03:00:00.000Z',
    );
    await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 142 },
      '2026-10-19T03:00:00.000Z',
    );

    const annulled = await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 517, Observacao: 'Digitado errado' },
      '2026-10-20T12:00:00.000Z',
    );

    expect(
      (
        await t.http(
          'post',
          `/follow-ups/${annulled}/annul`,
          tenant.tokens.professional,
          { reason: 'Valor digitado errado.' },
        )
      ).status,
    ).toBe(200);

    const medication = await t.http(
      'post',
      '/medications',
      tenant.tokens.professional,
      {
        patientId,
        name: 'Losartana potassica',
        doseAmount: 50,
        doseUnit: 'mg',
        times: ['08:00', '20:00'],
      },
    );

    expect(medication.status).toBe(201);

    return { patientId, annulled };
  };

  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!, {
      controllers: [
        FormController,
        FollowUpController,
        IndicatorController,
        MedicationController,
        ReportController,
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
        ...INDICATOR_USE_CASES,
        ...INDICATOR_REPOSITORIES,
        ...MEDICATION_USE_CASES,
        MedicationRepository,
        PatientRepository,
        ...REPORT_USE_CASES,
        ...REPORT_PROVIDERS,
      ],
    });
    pdfService = t.app.get(PatientReportPdfService);
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  it('o JSON confere com /evolution, /follow-ups e /medications no mesmo periodo', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);
    const response = await report(A.tokens.professional, s.patientId);

    expect(response.status).toBe(200);

    const body = dataOf<ReportBody>(response);
    const evolution = await t.http(
      'get',
      `/patients/${s.patientId}/evolution?${new URLSearchParams(OCTOBER)}`,
      A.tokens.professional,
    );
    const followUps = await t.http(
      'get',
      `/follow-ups?${new URLSearchParams({ patientId: s.patientId, status: 'valid', limit: '100', ...OCTOBER })}`,
      A.tokens.professional,
    );
    const medications = await t.http(
      'get',
      `/medications?${new URLSearchParams({ patientId: s.patientId, status: 'active' })}`,
      A.tokens.professional,
    );

    expect(body.series).toEqual(
      dataOf<{ series: unknown[] }>(evolution).series,
    );
    expect(body.records.items).toEqual(
      [...dataOf<Array<{ id: string }>>(followUps)].reverse(),
    );
    expect(body.records.total).toBe(3);
    expect(body.records.items.map((item) => item.id)).not.toContain(s.annulled);
    expect(body.records.byAuthor).toEqual([
      expect.objectContaining({ total: 3 }),
    ]);
    expect(body.medications.map((item) => item.id)).toEqual(
      dataOf<Array<{ id: string }>>(medications).map((item) => item.id),
    );
    expect(Object.keys(body.patient).sort()).toEqual([
      'birthDate',
      'id',
      'mainCondition',
      'name',
      'responsible',
      'secondaryConditions',
      'sex',
      'status',
    ]);
    expect(await exportsOf(s.patientId)).toEqual([]);
  });

  it('o PDF traz o relatorio, nao traz dado restrito nem anulado, e audita a exportacao', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);

    await t.dataSource.query(
      `UPDATE patients SET cpf = '52998224725' WHERE id = $1`,
      [s.patientId],
    );

    const response = await pdf(A.tokens.professional, s.patientId);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');

    const text = await pdfText(response);

    for (const expected of [
      'Maria Relatorio',
      'Hipertensao',
      '01/10/2026 a 31/10/2026',
      'Registros válidos: 3',
      'Média: 115 mg/dL',
      'Variação: 37 mg/dL',
      'Tendência: 2,056 mg/dL por dia (crescente)',
      'Tendência não calculada: são necessárias ao menos 3 medições.',
      'Observacao: Sem queixas',
      'Dor: 0',
      'Losartana potassica — 50 mg',
    ]) {
      expect(text).toContain(expected);
    }
    for (const hidden of [
      '52998224725',
      '11987654321',
      'Plano Sigiloso',
      '517',
      'Digitado errado',
      'Glicemia capilar: 92',
    ]) {
      expect(text).not.toContain(hidden);
    }

    expect(await exportsOf(s.patientId)).toEqual([
      { actorUserId: A.users.professional, afterValues: OCTOBER },
    ]);
  });

  it('periodo vazio e paciente inativo: PDF com aviso, auditado', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);

    await t.dataSource.query(
      `UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1`,
      [s.patientId],
    );

    const empty = { from: '2026-08-01', to: '2026-08-31' };
    const json = dataOf<ReportBody>(
      await report(A.tokens.admin, s.patientId, empty),
    );

    expect(json.records.total).toBe(0);
    expect(json.series).toEqual([]);
    expect(json.patient.status).toBe('inactive');

    const response = await pdf(A.tokens.admin, s.patientId, empty);

    expect(response.status).toBe(200);

    const text = await pdfText(response);

    expect(text).toContain('Nenhum registro válido no período.');
    expect(text).toContain('Situação: Inativo');
    expect(await exportsOf(s.patientId)).toEqual([
      { actorUserId: A.users.admin, afterValues: empty },
    ]);
  });

  it('falha na geracao: 500 sem auditoria; a nova tentativa gera e audita', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);

    jest
      .spyOn(pdfService as unknown as { draw: () => Promise<Buffer> }, 'draw')
      .mockRejectedValueOnce(new Error('falha sintetica'));

    const failed = await t.http(
      'get',
      `/patients/${s.patientId}/report/pdf`,
      A.tokens.professional,
    );

    expect(failed.status).toBe(500);
    expect(errorOf(failed).code).toBe('REPORT_EXPORT_FAILED');
    expect(await exportsOf(s.patientId)).toEqual([]);

    expect((await pdf(A.tokens.professional, s.patientId)).status).toBe(200);
    expect(await exportsOf(s.patientId)).toHaveLength(1);
  });

  it('sem autorizacao: cuidador e familiar 403, outra organizacao 404, sem token 401, periodo invalido 422', async () => {
    const { A, B } = t.tenants;
    const s = await scenario(A);

    for (const path of ['report', 'report/pdf']) {
      const url = `/patients/${s.patientId}/${path}`;

      expect((await t.http('get', url, A.tokens.caregiver)).status).toBe(403);
      expect((await t.http('get', url, A.tokens.family)).status).toBe(403);

      const otherTenant = await t.http('get', url, B.tokens.professional);

      expect(otherTenant.status).toBe(404);
      expect(errorOf(otherTenant).code).toBe('PATIENT_NOT_FOUND');
      expect((await t.http('get', url, B.tokens.admin)).status).toBe(404);
      expect(
        (await request(t.app.getHttpServer() as App).get(`/api/v1${url}`))
          .status,
      ).toBe(401);
      expect(
        (
          await t.http(
            'get',
            `${url}?from=2025-10-01&to=2026-10-02`,
            A.tokens.professional,
          )
        ).status,
      ).toBe(422);
    }

    expect(await exportsOf(s.patientId)).toEqual([]);
  });

  it('perfil trocado vale na requisicao seguinte', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);

    expect((await pdf(A.tokens.professional, s.patientId)).status).toBe(200);

    await t.dataSource.query(
      `UPDATE users SET profile_id = (SELECT id FROM access_profiles WHERE code = 'caregiver' AND organization_id = $2)
        WHERE id = $1`,
      [A.users.professional, A.id],
    );

    try {
      const denied = await t.http(
        'get',
        `/patients/${s.patientId}/report/pdf`,
        A.tokens.professional,
      );

      expect([401, 403]).toContain(denied.status);
      expect(await exportsOf(s.patientId)).toHaveLength(1);
    } finally {
      await t.dataSource.query(
        `UPDATE users SET profile_id = (SELECT id FROM access_profiles WHERE code = 'professional' AND organization_id = $2)
          WHERE id = $1`,
        [A.users.professional, A.id],
      );
    }
  });
});
