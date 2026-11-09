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
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';

import {
  bootNotificationApp,
  type NotificationApp,
  type Tenant,
} from '../Notification/notificationApp.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface FieldBody {
  id: string;
  fieldKey: string;
  name: string;
  position: number;
  [property: string]: unknown;
}

interface FormBody {
  id: string;
  currentVersion: { id: string; fields: FieldBody[] };
}

interface SeriesBody {
  fieldKey: string;
  name: string;
  fieldType: string;
  unit: string | null;
  scaleMin: number | null;
  scaleMax: number | null;
  section: string | null;
  form: { id: string; name: string };
  points: Array<{ value: number; visitedAt: string; followUpId: string }>;
  indicators: {
    sampleSize: number;
    min: number;
    max: number;
    mean: number | null;
    variation: number | null;
    trend: { slopePerDay: number; direction: string } | null;
    unavailable: Array<{
      indicator: string;
      reason: string;
      minimumSamples: number;
    }>;
  };
}

interface EvolutionBody {
  patientId: string;
  period: { from: string; to: string; timeZone: string };
  series: SeriesBody[];
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

describeWithDatabase('evolucao e indicadores do paciente (e2e)', () => {
  let t: NotificationApp;

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;
  const errorOf = (response: { body: unknown }) =>
    (
      response.body as {
        error: { code: string; fields: Array<{ field: string; code: string }> };
      }
    ).error;

  const newForm = async (tenant: Tenant, name: string): Promise<FormBody> => {
    const created = await t.http('post', '/forms', tenant.tokens.professional, {
      name,
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

  const field = (form: FormBody, name: string) =>
    form.currentVersion.fields.find((item) => item.name === name)!;

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
          fieldId: field(form, name).id,
          value,
        })),
      },
    );

    expect(response.status).toBe(201);

    return dataOf<{ id: string }>(response).id;
  };

  const evolution = (
    token: string,
    patientId: string,
    filters: Record<string, string> = {},
  ) =>
    t.http(
      'get',
      `/patients/${patientId}/evolution?${new URLSearchParams(filters)}`,
      token,
    );

  const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };

  /**
   * Visitas em UTC-3: r1 30/09 23:59 local (fora de outubro), r2 01/10 00:00,
   * r3 10/10, r4 19/10 e r5 20/10 anulado.
   */
  const scenario = async (tenant: Tenant) => {
    const patientId = await t.linkedPatient(tenant);
    const form = await newForm(tenant, `Sinais ${patientId}`);
    const r1 = await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 92 },
      '2026-10-01T02:59:00.000Z',
    );
    const r2 = await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 105, Dor: 0, Observacao: 'Sem queixas' },
      '2026-10-01T03:00:00.000Z',
    );
    const r3 = await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 98, Dor: 4 },
      '2026-10-10T03:00:00.000Z',
    );
    const r4 = await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 142 },
      '2026-10-19T03:00:00.000Z',
    );
    const r5 = await submit(
      tenant,
      patientId,
      form,
      { 'Glicemia capilar': 500 },
      '2026-10-20T12:00:00.000Z',
    );

    const annulled = await t.http(
      'post',
      `/follow-ups/${r5}/annul`,
      tenant.tokens.professional,
      { reason: 'Valor digitado errado.' },
    );

    expect(annulled.status).toBe(200);

    return { patientId, form, r1, r2, r3, r4, r5 };
  };

  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!, {
      controllers: [FormController, FollowUpController, IndicatorController],
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
      ],
    });
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  it('fixture conhecida: series por parametro, anulado e texto fora, limites do dia local', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);
    const response = await evolution(
      A.tokens.professional,
      s.patientId,
      OCTOBER,
    );

    expect(response.status).toBe(200);

    const body = dataOf<EvolutionBody>(response);

    expect(body.patientId).toBe(s.patientId);
    expect(body.period).toEqual({
      ...OCTOBER,
      timeZone: 'America/Sao_Paulo',
    });
    expect(body.series.map((series) => series.name)).toEqual([
      'Glicemia capilar',
      'Dor',
    ]);

    const [glicemia, dor] = body.series;

    expect(glicemia).toMatchObject({
      fieldKey: field(s.form, 'Glicemia capilar').fieldKey,
      fieldType: 'number',
      unit: 'mg/dL',
      scaleMin: null,
      scaleMax: null,
      section: 'Sinais vitais',
      form: { id: s.form.id },
    });
    expect(glicemia.points).toEqual([
      { value: 105, visitedAt: '2026-10-01T03:00:00.000Z', followUpId: s.r2 },
      { value: 98, visitedAt: '2026-10-10T03:00:00.000Z', followUpId: s.r3 },
      { value: 142, visitedAt: '2026-10-19T03:00:00.000Z', followUpId: s.r4 },
    ]);
    expect(glicemia.indicators).toEqual({
      sampleSize: 3,
      min: 98,
      max: 142,
      mean: 115,
      variation: 37,
      trend: { slopePerDay: 2.056, direction: 'rising' },
      unavailable: [],
    });

    expect(dor).toMatchObject({
      fieldType: 'scale',
      scaleMin: 0,
      scaleMax: 10,
    });
    expect(dor.indicators).toEqual({
      sampleSize: 2,
      min: 0,
      max: 4,
      mean: 2,
      variation: 4,
      trend: null,
      unavailable: [
        {
          indicator: 'trend',
          reason: 'INSUFFICIENT_SAMPLES',
          minimumSamples: 3,
        },
      ],
    });

    const september = dataOf<EvolutionBody>(
      await evolution(A.tokens.professional, s.patientId, { to: '2026-09-30' }),
    );

    expect(september.period.from).toBe('2026-09-01');
    expect(september.series).toHaveLength(1);
    expect(september.series[0].points).toEqual([
      { value: 92, visitedAt: '2026-10-01T02:59:00.000Z', followUpId: s.r1 },
    ]);
    expect(september.series[0].indicators.mean).toBe(92);
  });

  it('periodo padrao de 30 dias ate hoje e filtros por formulario e parametro', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);
    const other = await newForm(A, `Outro ${s.patientId}`);

    await submit(
      A,
      s.patientId,
      other,
      { 'Glicemia capilar': 110 },
      '2026-10-05T12:00:00.000Z',
    );

    const standard = dataOf<EvolutionBody>(
      await evolution(A.tokens.professional, s.patientId),
    );
    const today = todayInBrazil();

    expect(standard.period.to).toBe(today);
    expect(
      (Date.parse(standard.period.to) - Date.parse(standard.period.from)) /
        86_400_000,
    ).toBe(29);

    const all = dataOf<EvolutionBody>(
      await evolution(A.tokens.professional, s.patientId, OCTOBER),
    );

    expect(
      all.series.map((series) => `${series.form.name}/${series.name}`),
    ).toEqual([
      `Outro ${s.patientId}/Glicemia capilar`,
      `Sinais ${s.patientId}/Glicemia capilar`,
      `Sinais ${s.patientId}/Dor`,
    ]);

    const byForm = dataOf<EvolutionBody>(
      await evolution(A.tokens.professional, s.patientId, {
        ...OCTOBER,
        formId: other.id,
      }),
    );

    expect(byForm.series.map((series) => series.points.length)).toEqual([1]);

    const byField = dataOf<EvolutionBody>(
      await evolution(A.tokens.professional, s.patientId, {
        ...OCTOBER,
        fieldKey: field(s.form, 'Dor').fieldKey,
      }),
    );

    expect(byField.series.map((series) => series.name)).toEqual(['Dor']);

    const empty = await evolution(A.tokens.professional, s.patientId, {
      from: '2026-01-01',
      to: '2026-01-31',
    });

    expect(empty.status).toBe(200);
    expect(dataOf<EvolutionBody>(empty).series).toEqual([]);
  });

  it('unidade trocada numa nova versao separa a serie em vez de misturar', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);
    const fields = s.form.currentVersion.fields.map(
      ({ id: _id, position: _position, ...rest }) =>
        rest.name === 'Glicemia capilar'
          ? { ...rest, unit: 'mmol/L', decimalPlaces: 1 }
          : rest,
    );
    const draft = await t.http(
      'put',
      `/forms/${s.form.id}/draft`,
      A.tokens.professional,
      { fields },
    );

    expect(draft.status).toBe(200);

    const published = await t.http(
      'post',
      `/forms/${s.form.id}/publish`,
      A.tokens.professional,
      { confirmImpact: true },
    );

    expect(published.status).toBe(200);

    const v2 = dataOf<FormBody>(published);
    const r6 = await submit(
      A,
      s.patientId,
      v2,
      { 'Glicemia capilar': 6.1 },
      '2026-10-25T12:00:00.000Z',
    );
    const body = dataOf<EvolutionBody>(
      await evolution(A.tokens.professional, s.patientId, OCTOBER),
    );
    const glicemias = body.series.filter(
      (series) => series.name === 'Glicemia capilar',
    );

    expect(glicemias.map((series) => series.unit)).toEqual(['mmol/L', 'mg/dL']);
    expect(glicemias[0].fieldKey).toBe(glicemias[1].fieldKey);
    expect(glicemias[0].points).toEqual([
      { value: 6.1, visitedAt: '2026-10-25T12:00:00.000Z', followUpId: r6 },
    ]);
    expect(glicemias[1].indicators.mean).toBe(115);
  });

  it('familiar vinculado recebe o mesmo que o profissional; cuidador sem permissao', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);
    const professional = await evolution(
      A.tokens.professional,
      s.patientId,
      OCTOBER,
    );
    const family = await evolution(A.tokens.family, s.patientId, OCTOBER);
    const admin = await evolution(A.tokens.admin, s.patientId, OCTOBER);

    expect(family.status).toBe(200);
    expect(dataOf(family)).toEqual(dataOf(professional));
    expect(dataOf(admin)).toEqual(dataOf(professional));

    const caregiver = await evolution(A.tokens.caregiver, s.patientId, OCTOBER);

    expect(caregiver.status).toBe(403);
    expect(errorOf(caregiver).code).toBe('AUTH_FORBIDDEN');
  });

  it('fora do alcance: outra organizacao, sem vinculo e vinculo revogado respondem 404', async () => {
    const { A, B } = t.tenants;
    const s = await scenario(A);

    const crossTenant = await evolution(B.tokens.professional, s.patientId);

    expect(crossTenant.status).toBe(404);
    expect(errorOf(crossTenant).code).toBe('PATIENT_NOT_FOUND');
    expect((crossTenant.body as { data?: unknown }).data).toBeUndefined();

    const [{ id: unlinked }] = await t.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO patients (organization_id, name, birth_date)
       VALUES ($1, 'Sem vinculo', '1950-01-01') RETURNING id`,
      [A.id],
    );

    expect((await evolution(A.tokens.family, unlinked)).status).toBe(404);

    await t.dataSource.query(
      `UPDATE user_patients SET deleted_at = now()
        WHERE organization_id = $1 AND user_id = $2 AND patient_id = $3`,
      [A.id, A.users.family, s.patientId],
    );

    const revoked = await evolution(A.tokens.family, s.patientId, OCTOBER);

    expect(revoked.status).toBe(404);
    expect(errorOf(revoked).code).toBe('PATIENT_NOT_FOUND');
  });

  it('periodo invalido responde 422 por campo', async () => {
    const { A } = t.tenants;
    const patientId = await t.linkedPatient(A);

    const tooLong = await evolution(A.tokens.professional, patientId, {
      from: '2025-01-01',
      to: '2026-01-02',
    });

    expect(tooLong.status).toBe(422);
    expect(errorOf(tooLong).code).toBe('VALIDATION_FAILED');
    expect(errorOf(tooLong).fields).toMatchObject([
      { field: 'to', code: 'PERIOD_TOO_LONG' },
    ]);

    const reversed = await evolution(A.tokens.professional, patientId, {
      from: '2026-10-10',
      to: '2026-10-01',
    });

    expect(reversed.status).toBe(422);
    expect(errorOf(reversed).fields.map((item) => item.field)).toEqual(['to']);

    const malformed = await evolution(A.tokens.professional, patientId, {
      fieldKey: 'glicemia',
    });

    expect(malformed.status).toBe(422);
  });
});
