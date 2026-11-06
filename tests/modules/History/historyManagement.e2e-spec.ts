import { EvaluateFollowUpAlertsUseCase } from '@/modules/Alert/EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { FollowUpController } from '@/modules/FollowUp/followUp.controller';
import { FOLLOW_UP_USE_CASES } from '@/modules/FollowUp/followUp.module';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import { FormController } from '@/modules/Form/form.controller';
import { FORM_USE_CASES } from '@/modules/Form/form.module';
import { FormRepository } from '@/modules/Form/repositories/form.repository';
import { HistoryController } from '@/modules/History/history.controller';
import {
  HISTORY_REPOSITORIES,
  HISTORY_USE_CASES,
} from '@/modules/History/history.module';
import { MedicationController } from '@/modules/Medication/medication.controller';
import { MEDICATION_USE_CASES } from '@/modules/Medication/medication.module';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';

import {
  bootNotificationApp,
  type NotificationApp,
  type Tenant,
} from '../Notification/notificationApp.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface FormBody {
  id: string;
  currentVersion: {
    id: string;
    fields: Array<{ id: string; fieldKey: string; name: string }>;
  };
}

interface FollowUpBody {
  id: string;
  author: { id: string };
  visitedAt: string;
  status: string;
  answers: Array<{ name: string; value: unknown }>;
}

interface OverviewBody {
  patientId: string;
  counts: {
    validFollowUps: number;
    openAlerts: number | null;
    activeMedications: number | null;
  };
  lastVisitedAt: string | null;
  measurements: Array<{
    fieldKey: string;
    name: string;
    fieldType: string;
    unit: string | null;
    section: string | null;
    form: { id: string; name: string };
    values: Array<{ value: number; visitedAt: string; followUpId: string }>;
  }>;
  activeMedications: Array<{ id: string; name: string; status: string }> | null;
  recentAlerts: Array<{ id: string; status: string }> | null;
}

interface PageBody<T> {
  data: T[];
  meta: { pagination: { total: number } };
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

const ROUTINE = [
  {
    name: 'Banho assistido',
    fieldType: 'boolean',
    requirement: 'optional',
    section: 'Atividades',
  },
];

describeWithDatabase('historico e visao consolidada do paciente (e2e)', () => {
  let t: NotificationApp;

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;
  const codeOf = (response: { body: unknown }) =>
    (response.body as { error: { code: string } }).error.code;

  const newForm = async (
    tenant: Tenant,
    name: string,
    fields: object[],
  ): Promise<FormBody> => {
    const created = await t.http('post', '/forms', tenant.tokens.professional, {
      name,
      audience: 'organization',
      fields,
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
    token = tenant.tokens.caregiver,
  ): Promise<FollowUpBody> => {
    const response = await t.http('post', '/follow-ups', token, {
      patientId,
      formId: form.id,
      formVersionId: form.currentVersion.id,
      visitedAt,
      answers: Object.entries(values).map(([name, value]) => ({
        fieldId: field(form, name).id,
        value,
      })),
    });

    expect(response.status).toBe(201);

    return dataOf<FollowUpBody>(response);
  };

  const history = async (
    token: string,
    patientId: string,
    filters: Record<string, string> = {},
  ) => {
    const query = new URLSearchParams({ patientId, ...filters });
    const response = await t.http('get', `/follow-ups?${query}`, token);

    expect(response.status).toBe(200);

    const page = response.body as PageBody<FollowUpBody>;

    return { ids: page.data.map((item) => item.id), page };
  };

  const overview = (token: string, patientId: string) =>
    t.http('get', `/patients/${patientId}/overview`, token);

  /**
   * Paciente com cuidador e cuidador2 vinculados e quatro registros em dias
   * locais de Sao Paulo (UTC-3): r1 e 30/09 23:30, r2 01/10, r3 02/10 e r4
   * 02/10 23:59 (anulado).
   */
  const scenario = async (tenant: Tenant) => {
    const patientId = await t.linkedPatient(tenant);

    await t.dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, 'caregiver')`,
      [tenant.id, tenant.users.caregiver2, patientId],
    );

    const vitals = await newForm(tenant, `Sinais ${patientId}`, VITALS);
    const routine = await newForm(tenant, `Rotina ${patientId}`, ROUTINE);
    const r1 = await submit(
      tenant,
      patientId,
      vitals,
      { 'Glicemia capilar': 100 },
      '2026-10-01T02:30:00.000Z',
    );
    const r2 = await submit(
      tenant,
      patientId,
      vitals,
      { 'Glicemia capilar': 0, Dor: 3 },
      '2026-10-01T12:00:00.000Z',
      tenant.tokens.caregiver2,
    );
    const r3 = await submit(
      tenant,
      patientId,
      routine,
      { 'Banho assistido': false },
      '2026-10-02T12:00:00.000Z',
    );
    const r4 = await submit(
      tenant,
      patientId,
      vitals,
      { 'Glicemia capilar': 140 },
      '2026-10-03T02:59:00.000Z',
    );

    const annulled = await t.http(
      'post',
      `/follow-ups/${r4.id}/annul`,
      tenant.tokens.professional,
      { reason: 'Valor digitado errado.' },
    );

    expect(annulled.status).toBe(200);

    return { patientId, vitals, routine, r1, r2, r3, r4 };
  };

  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!, {
      controllers: [
        FormController,
        FollowUpController,
        MedicationController,
        HistoryController,
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
        ...MEDICATION_USE_CASES,
        MedicationRepository,
        ...HISTORY_USE_CASES,
        ...HISTORY_REPOSITORIES,
      ],
    });
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  describe('historico (GET /follow-ups)', () => {
    it('filtros combinados: parametro, secao, responsavel, formulario e status', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);
      const token = A.tokens.professional;
      const glicemia = field(s.vitals, 'Glicemia capilar').fieldKey;
      const dor = field(s.vitals, 'Dor').fieldKey;

      expect((await history(token, s.patientId)).ids).toEqual([
        s.r4.id,
        s.r3.id,
        s.r2.id,
        s.r1.id,
      ]);
      expect(
        (await history(token, s.patientId, { fieldKey: glicemia })).ids,
      ).toEqual([s.r4.id, s.r2.id, s.r1.id]);
      expect(
        (await history(token, s.patientId, { fieldKey: dor })).ids,
      ).toEqual([s.r2.id]);
      expect(
        (await history(token, s.patientId, { section: 'sinais VITAIS' })).ids,
      ).toEqual([s.r4.id, s.r2.id, s.r1.id]);
      expect(
        (await history(token, s.patientId, { formId: s.routine.id })).ids,
      ).toEqual([s.r3.id]);
      expect(
        (
          await history(token, s.patientId, {
            fieldKey: glicemia,
            authorUserId: A.users.caregiver,
            status: 'valid',
          })
        ).ids,
      ).toEqual([s.r1.id]);
      expect(
        (
          await history(token, s.patientId, {
            formId: s.vitals.id,
            authorUserId: A.users.caregiver2,
            from: '2026-10-01',
            to: '2026-10-01',
          })
        ).ids,
      ).toEqual([s.r2.id]);

      const [withDor] = (await history(token, s.patientId, { fieldKey: dor }))
        .page.data;

      expect(withDor.answers.map((answer) => answer.name)).toEqual([
        'Glicemia capilar',
        'Dor',
      ]);
    });

    it('periodo pelo dia local de Sao Paulo, inclusivo nas duas pontas, com paginacao', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);
      const token = A.tokens.caregiver;

      expect(
        (await history(token, s.patientId, { to: '2026-09-30' })).ids,
      ).toEqual([s.r1.id]);
      expect(
        (await history(token, s.patientId, { from: '2026-10-02' })).ids,
      ).toEqual([s.r4.id, s.r3.id]);

      const firstPage = await history(token, s.patientId, {
        from: '2026-10-01',
        to: '2026-10-02',
        limit: '1',
      });

      expect(firstPage.ids).toEqual([s.r4.id]);
      expect(firstPage.page.meta.pagination.total).toBe(3);
    });

    it('periodo sem registro responde 200 com lista vazia e total zero', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);
      const empty = await history(A.tokens.family, s.patientId, {
        from: '2026-08-01',
        to: '2026-08-31',
      });

      expect(empty.ids).toEqual([]);
      expect(empty.page.meta.pagination.total).toBe(0);
    });

    it('fim antes do inicio e 422 com o campo to', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);
      const response = await t.http(
        'get',
        `/follow-ups?patientId=${s.patientId}&from=2026-10-02&to=2026-10-01`,
        A.tokens.professional,
      );

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('VALIDATION_FAILED');
      expect(
        (
          response.body as { error: { fields: Array<{ field: string }> } }
        ).error.fields.map((item) => item.field),
      ).toEqual(['to']);
    });
  });

  describe('visao consolidada (GET /patients/:patientId/overview)', () => {
    it('contadores, ultima visita, medicoes por parametro, medicamentos ativos e alertas recentes', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);
      const glicemia = field(s.vitals, 'Glicemia capilar').fieldKey;

      for (const [name, time] of [
        ['Losartana', '08:00'],
        ['Metformina', '12:00'],
        ['Suspenso', '20:00'],
      ]) {
        const created = await t.http(
          'post',
          '/medications',
          A.tokens.professional,
          {
            patientId: s.patientId,
            name,
            doseAmount: 50,
            doseUnit: 'mg',
            times: [time],
          },
        );

        expect(created.status).toBe(201);

        if (name === 'Suspenso') {
          await t.http(
            'post',
            `/medications/${dataOf<{ id: string }>(created).id}/deactivate`,
            A.tokens.professional,
          );
        }
      }

      const open = await t.notifiedAlert(A, s.patientId, 'critical');
      const resolved = await t.notifiedAlert(A, s.patientId);

      expect(
        (
          await t.http(
            'post',
            `/alerts/${resolved}/resolve`,
            A.tokens.professional,
          )
        ).status,
      ).toBe(200);

      const response = await overview(A.tokens.caregiver, s.patientId);

      expect(response.status).toBe(200);

      const body = dataOf<OverviewBody>(response);

      expect(body.patientId).toBe(s.patientId);
      expect(body.counts).toEqual({
        validFollowUps: 3,
        openAlerts: 1,
        activeMedications: 2,
      });
      expect(body.lastVisitedAt).toBe(s.r3.visitedAt);
      expect(
        body.activeMedications?.map((medication) => medication.name),
      ).toEqual(['Losartana', 'Metformina']);
      expect(
        body.recentAlerts?.map((alert) => [alert.id, alert.status]),
      ).toEqual([
        [resolved, 'resolved'],
        [open, 'open'],
      ]);
      expect(body.measurements).toEqual([
        {
          fieldKey: glicemia,
          name: 'Glicemia capilar',
          fieldType: 'number',
          unit: 'mg/dL',
          section: 'Sinais vitais',
          form: { id: s.vitals.id, name: `Sinais ${s.patientId}` },
          values: [
            { value: 0, visitedAt: s.r2.visitedAt, followUpId: s.r2.id },
            { value: 100, visitedAt: s.r1.visitedAt, followUpId: s.r1.id },
          ],
        },
        {
          fieldKey: field(s.vitals, 'Dor').fieldKey,
          name: 'Dor',
          fieldType: 'scale',
          unit: null,
          section: 'Bem-estar',
          form: { id: s.vitals.id, name: `Sinais ${s.patientId}` },
          values: [
            { value: 3, visitedAt: s.r2.visitedAt, followUpId: s.r2.id },
          ],
        },
      ]);
    });

    it('ate cinco valores por parametro, reunindo versoes pelo fieldKey com o nome da mais recente', async () => {
      const { A } = t.tenants;
      const patientId = await t.linkedPatient(A);
      const v1 = await newForm(A, `Glicemia ${patientId}`, [VITALS[0]]);
      const key = field(v1, 'Glicemia capilar').fieldKey;
      const visits = [1, 2, 3, 4].map((day) => `2026-10-0${day}T12:00:00.000Z`);

      for (const [index, visitedAt] of visits.entries()) {
        await submit(
          A,
          patientId,
          v1,
          { 'Glicemia capilar': 90 + index },
          visitedAt,
        );
      }

      expect(
        (
          await t.http('put', `/forms/${v1.id}/draft`, A.tokens.professional, {
            fields: [
              { ...VITALS[0], fieldKey: key, name: 'Glicemia', unit: 'mg/dl' },
            ],
          })
        ).status,
      ).toBe(200);

      const v2 = dataOf<FormBody>(
        await t.http('post', `/forms/${v1.id}/publish`, A.tokens.professional, {
          confirmImpact: true,
        }),
      );

      await submit(
        A,
        patientId,
        v2,
        { Glicemia: 120 },
        '2026-10-05T12:00:00.000Z',
      );
      await submit(
        A,
        patientId,
        v2,
        { Glicemia: 121 },
        '2026-10-06T12:00:00.000Z',
      );

      const [measurement] = dataOf<OverviewBody>(
        await overview(A.tokens.professional, patientId),
      ).measurements;

      expect(measurement).toMatchObject({
        fieldKey: key,
        name: 'Glicemia',
        unit: 'mg/dl',
      });
      expect(measurement.values.map((item) => item.value)).toEqual([
        121, 120, 93, 92, 91,
      ]);
    });

    it('paciente sem registro: contadores zerados, sem medicoes nem ultima visita', async () => {
      const { A } = t.tenants;
      const patientId = await t.linkedPatient(A);
      const response = await overview(A.tokens.family, patientId);

      expect(response.status).toBe(200);
      expect(dataOf<OverviewBody>(response)).toEqual({
        patientId,
        counts: { validFollowUps: 0, openAlerts: 0, activeMedications: 0 },
        lastVisitedAt: null,
        measurements: [],
        activeMedications: [],
        recentAlerts: [],
      });
    });

    it('perfil sem alerts:read e medications:read recebe esses blocos e contadores nulos', async () => {
      const { A } = t.tenants;
      const s = await scenario(A);

      await t.dataSource.query(
        `DELETE FROM profile_permissions pp
          USING access_profiles ap, permissions p
          WHERE pp.profile_id = ap.id
            AND pp.permission_id = p.id
            AND ap.organization_id = $1
            AND ap.code = 'family'
            AND p.code IN ('alerts:read', 'medications:read')`,
        [A.id],
      );

      const body = dataOf<OverviewBody>(
        await overview(A.tokens.family, s.patientId),
      );

      expect(body.counts).toEqual({
        validFollowUps: 3,
        openAlerts: null,
        activeMedications: null,
      });
      expect(body.recentAlerts).toBeNull();
      expect(body.activeMedications).toBeNull();
      expect(body.measurements).toHaveLength(2);
    });
  });

  it('historico e visao consolidada continuam legiveis apos inativar o paciente', async () => {
    const { A } = t.tenants;
    const s = await scenario(A);

    await t.dataSource.query(
      `UPDATE patients SET status = 'inactive', deleted_at = now()
        WHERE id = $1`,
      [s.patientId],
    );

    for (const [token, records] of [
      [A.tokens.admin, 4],
      [A.tokens.caregiver, 4],
      // O familiar nao ve o anulado (BE-19).
      [A.tokens.family, 3],
    ] as const) {
      expect((await history(token, s.patientId)).ids).toHaveLength(records);

      const response = await overview(token, s.patientId);

      expect(response.status).toBe(200);
      expect(dataOf<OverviewBody>(response).counts.validFollowUps).toBe(3);
    }
  });

  it('sem vinculo, vinculo revogado e outra organizacao: 404 sem contagem nem conteudo', async () => {
    const { A, B } = t.tenants;
    const s = await scenario(A);
    const other = await t.linkedPatient(A);

    await t.dataSource.query(
      `UPDATE user_patients SET deleted_at = now()
        WHERE patient_id = $1 AND user_id = $2`,
      [s.patientId, A.users.family],
    );

    const denied: Array<[string, string]> = [
      [A.tokens.caregiver2, other],
      [A.tokens.family, s.patientId],
      [B.tokens.admin, s.patientId],
      [B.tokens.caregiver, s.patientId],
    ];

    for (const [token, patientId] of denied) {
      for (const response of [
        await t.http(
          'get',
          `/follow-ups?patientId=${patientId}&from=2026-01-01&section=Sinais%20vitais`,
          token,
        ),
        await overview(token, patientId),
      ]) {
        expect(response.status).toBe(404);
        expect(codeOf(response)).toBe('PATIENT_NOT_FOUND');
        expect(response.body).not.toHaveProperty('data');
        expect(JSON.stringify(response.body)).not.toMatch(
          /count|total|pagination/i,
        );
      }
    }

    expect(
      (
        await t.http(
          'get',
          `/patients/${s.patientId}/overview`,
          A.tokens.caregiver2,
        )
      ).status,
    ).toBe(200);
  });
});
