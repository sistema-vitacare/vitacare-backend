import {
  bootNotificationApp,
  type NotificationApp,
  type Role,
  type Tenant,
} from '../Notification/notificationApp.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface AlertBody {
  id: string;
  severity: string;
  status: string;
  patient: { id: string; name: string; mainCondition: string | null };
  followUp: unknown;
}

interface Counts {
  total: number;
  critical: number;
  warning: number;
  info: number;
}

const SEVERITIES = ['critical', 'warning', 'info'] as const;

/**
 * Lista da organizacao e contadores da Figura 42 (BE-33) com guards, login e
 * alcance reais: duas organizacoes, os quatro perfis, cuidador sem vinculo,
 * paciente sem vinculo, paciente inativo e vinculo revogado.
 */
describeWithDatabase('alertas da organizacao (e2e)', () => {
  let t: NotificationApp;
  let A: Tenant;
  let B: Tenant;
  const ids = {} as Record<
    'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'b1',
    string
  >;
  const patients = {} as Record<'linked' | 'unlinked' | 'inactive', string>;

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;
  const totalOf = (response: { body: unknown }) =>
    (response.body as { meta: { pagination: { total: number } } }).meta
      .pagination.total;
  const codeOf = (response: { body: unknown }) =>
    (response.body as { error: { code: string } }).error.code;

  const list = async (tenant: Tenant, role: Role, query = '') => {
    const response = await t.http(
      'get',
      `/alerts?${query}`,
      tenant.tokens[role],
    );

    expect(response.status).toBe(200);

    return {
      ids: dataOf<AlertBody[]>(response).map((alert) => alert.id),
      items: dataOf<AlertBody[]>(response),
      total: totalOf(response),
    };
  };

  const summary = async (tenant: Tenant, role: Role, query = '') => {
    const response = await t.http(
      'get',
      `/alerts/summary?${query}`,
      tenant.tokens[role],
    );

    expect(response.status).toBe(200);

    return dataOf<{ open: Counts }>(response).open;
  };

  /** Cada contador e o `total` da lista aberta naquela severidade. */
  const expectCountsMatchList = async (
    tenant: Tenant,
    role: Role,
    query = '',
  ) => {
    const counts = await summary(tenant, role, query);
    const prefix = query ? `${query}&` : '';

    expect(counts.total).toBe(
      (await list(tenant, role, `${prefix}status=open`)).total,
    );

    for (const severity of SEVERITIES) {
      expect(counts[severity]).toBe(
        (await list(tenant, role, `${prefix}status=open&severity=${severity}`))
          .total,
      );
    }

    expect(counts.total).toBe(counts.critical + counts.warning + counts.info);

    return counts;
  };

  const alertAt = async (
    tenant: Tenant,
    patient: string,
    severity: 'critical' | 'warning' | 'info',
    minutesAgo: number,
  ) => {
    const alert = await t.notifiedAlert(tenant, patient, severity);

    await t.dataSource.query(
      `UPDATE alerts SET generated_at = now() - make_interval(mins => $2)
        WHERE id = $1`,
      [alert, minutesAgo],
    );

    return alert;
  };

  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!);
    ({ A, B } = t.tenants);

    patients.linked = await t.linkedPatient(A, 'Paciente Vinculado');
    patients.inactive = await t.linkedPatient(A, 'Paciente Inativo');
    patients.unlinked = (await t.scalar(
      `INSERT INTO patients (organization_id, name, birth_date)
       VALUES ($1, 'Paciente Sem Vinculo', '1950-01-01') RETURNING id AS value`,
      [A.id],
    ))!;

    await t.dataSource.query(
      "UPDATE patients SET main_condition = 'Hipertensao arterial' WHERE id = $1",
      [patients.linked],
    );

    ids.a1 = await alertAt(A, patients.linked, 'info', 10);
    ids.a2 = await alertAt(A, patients.linked, 'critical', 50);
    ids.a3 = await alertAt(A, patients.linked, 'warning', 5);
    ids.a4 = await alertAt(A, patients.unlinked, 'warning', 30);
    ids.a5 = await alertAt(A, patients.inactive, 'critical', 20);
    ids.a6 = await alertAt(A, patients.linked, 'warning', 1);
    ids.b1 = await alertAt(
      B,
      await t.linkedPatient(B, 'Paciente Outra Org'),
      'critical',
      3,
    );

    expect(
      (await t.http('post', `/alerts/${ids.a6}/resolve`, A.tokens.professional))
        .status,
    ).toBe(200);
    await t.dataSource.query(
      "UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1",
      [patients.inactive],
    );
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  it('admin e profissional veem a organizacao inteira, inclusive paciente inativo e sem vinculo', async () => {
    for (const role of ['admin', 'professional'] as const) {
      expect((await list(A, role)).ids).toEqual([
        ids.a6,
        ids.a3,
        ids.a1,
        ids.a5,
        ids.a4,
        ids.a2,
      ]);
      expect((await list(A, role, 'status=open&sort=priority')).ids).toEqual([
        ids.a5,
        ids.a2,
        ids.a3,
        ids.a4,
        ids.a1,
      ]);
      expect((await list(A, role, 'status=resolved')).ids).toEqual([ids.a6]);
      expect(await expectCountsMatchList(A, role)).toEqual({
        total: 5,
        critical: 2,
        warning: 2,
        info: 1,
      });
    }
  });

  it('cuidador e familiar veem so os pacientes vinculados; sem vinculo, lista vazia', async () => {
    for (const role of ['caregiver', 'family'] as const) {
      expect((await list(A, role, 'status=open&sort=priority')).ids).toEqual([
        ids.a5,
        ids.a2,
        ids.a3,
        ids.a1,
      ]);
      expect(await expectCountsMatchList(A, role)).toEqual({
        total: 4,
        critical: 2,
        warning: 1,
        info: 1,
      });
    }

    expect(await list(A, 'caregiver2')).toEqual({
      ids: [],
      items: [],
      total: 0,
    });
    expect(await expectCountsMatchList(A, 'caregiver2')).toEqual({
      total: 0,
      critical: 0,
      warning: 0,
      info: 0,
    });

    const outside = await t.http(
      'get',
      `/alerts/summary?patientId=${patients.unlinked}`,
      A.tokens.caregiver,
    );

    expect(outside.status).toBe(404);
    expect(codeOf(outside)).toBe('PATIENT_NOT_FOUND');
  });

  it('outra organizacao nao aparece e paciente dela responde 404', async () => {
    expect((await list(B, 'admin')).ids).toEqual([ids.b1]);
    expect(await summary(B, 'admin')).toEqual({
      total: 1,
      critical: 1,
      warning: 0,
      info: 0,
    });
    expect((await list(A, 'admin')).ids).not.toContain(ids.b1);

    for (const path of ['/alerts', '/alerts/summary']) {
      const response = await t.http(
        'get',
        `${path}?patientId=${patients.linked}`,
        B.tokens.admin,
      );

      expect(response.status).toBe(404);
      expect(codeOf(response)).toBe('PATIENT_NOT_FOUND');
    }
  });

  it('filtros combinados, paginacao estavel e dados da linha', async () => {
    const one = await list(
      A,
      'professional',
      `patientId=${patients.linked}&status=open&severity=warning&source=absence&sort=priority`,
    );

    expect(one.ids).toEqual([ids.a3]);
    expect(one.items[0]).toMatchObject({
      patient: {
        id: patients.linked,
        name: 'Paciente Vinculado',
        mainCondition: 'Hipertensao arterial',
      },
      followUp: null,
    });
    expect(
      (await list(A, 'professional', 'source=reading&status=open')).total,
    ).toBe(0);
    expect(await summary(A, 'professional', 'source=reading')).toEqual({
      total: 0,
      critical: 0,
      warning: 0,
      info: 0,
    });
    expect(
      await expectCountsMatchList(
        A,
        'professional',
        `patientId=${patients.linked}&source=absence`,
      ),
    ).toEqual({ total: 3, critical: 1, warning: 1, info: 1 });

    const first = await list(A, 'admin', 'status=open&sort=priority&limit=2');
    const second = await list(
      A,
      'admin',
      'status=open&sort=priority&limit=2&page=2',
    );

    expect([first.total, second.total]).toEqual([5, 5]);
    expect([...first.ids, ...second.ids]).toEqual([
      ids.a5,
      ids.a2,
      ids.a3,
      ids.a4,
    ]);
    expect(
      (await list(A, 'family', `patientId=${patients.inactive}`)).ids,
    ).toEqual([ids.a5]);
  });

  it('parametro invalido responde 422; contadores nao aceitam severidade nem status', async () => {
    for (const path of [
      '/alerts?sort=severity',
      '/alerts?source=manual',
      '/alerts?patientId=x',
      '/alerts/summary?severity=critical',
      '/alerts/summary?status=open',
      '/alerts/summary?sort=priority',
    ]) {
      const response = await t.http('get', path, A.tokens.admin);

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('VALIDATION_FAILED');
    }
  });

  it('vinculo revogado deixa de valer na requisicao seguinte', async () => {
    await t.dataSource.query(
      `UPDATE user_patients SET deleted_at = now()
        WHERE user_id = $1 AND patient_id = $2 AND deleted_at IS NULL`,
      [A.users.caregiver, patients.inactive],
    );

    expect((await list(A, 'caregiver', 'status=open')).ids).not.toContain(
      ids.a5,
    );
    expect(await expectCountsMatchList(A, 'caregiver')).toEqual({
      total: 3,
      critical: 1,
      warning: 1,
      info: 1,
    });
    expect(
      (
        await t.http(
          'get',
          `/alerts/summary?patientId=${patients.inactive}`,
          A.tokens.caregiver,
        )
      ).status,
    ).toBe(404);
    expect((await summary(A, 'family')).total).toBe(4);
  });
});
