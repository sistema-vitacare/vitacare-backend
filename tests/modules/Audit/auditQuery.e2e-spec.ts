import { AuditController } from '@/modules/Audit/audit.controller';
import {
  AUDIT_REPOSITORIES,
  AUDIT_SERVICES,
  AUDIT_USE_CASES,
} from '@/modules/Audit/audit.module';
import type {
  AuditActionDto,
  AuditEventDetailDto,
  AuditEventDto,
} from '@/modules/Audit/dtos/auditEvent.dto';
import { maskPersonName } from '@/modules/Audit/policies/auditPersonalData.policy';

import {
  bootNotificationApp,
  type NotificationApp,
  type Tenant,
} from '../Notification/notificationApp.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const OCTOBER = 'from=2026-10-01&to=2026-10-31';

interface EventInput {
  organizationId: string;
  actorUserId: string | null;
  profile: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  occurredAt: string;
  afterValues?: object;
  ip?: string;
}

describeWithDatabase('consulta da auditoria (BE-23, UC06, e2e)', () => {
  let t: NotificationApp;
  let A: Tenant;
  let B: Tenant;
  const ids: Record<string, string> = {};

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;
  const metaOf = (response: { body: unknown }) =>
    (response.body as { meta: Record<string, unknown> }).meta;
  const errorCode = (response: { body: unknown }) =>
    (response.body as { error: { code: string } }).error.code;

  const list = (token: string, query: string) =>
    t.http('get', `/audit-events?${query}`, token);
  const listIds = async (token: string, query: string) =>
    dataOf<AuditEventDto[]>(await list(token, query)).map((event) => event.id);

  const event = (input: EventInput) =>
    t.scalar(
      `INSERT INTO audit_events
         (organization_id, actor_type, actor_user_id, actor_profile_code, action,
          entity_type, entity_id, after_values, occurred_at, ip_address, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'req-teste')
       RETURNING id AS value`,
      [
        input.organizationId,
        input.actorUserId === null ? 'system' : 'user',
        input.actorUserId,
        input.profile,
        input.action,
        input.entityType,
        input.entityId,
        input.afterValues ? JSON.stringify(input.afterValues) : null,
        input.occurredAt,
        input.ip ?? null,
      ],
    ) as Promise<string>;

  /**
   * Outubro em UTC-3. A: e1 01/10 00:00 (inicio), e2 31/10 23:59 (fim),
   * e3 01/11 00:00 (fora), alerta critico de sistema em 15/10, paciente
   * cadastrado pelo profissional em 10/10. B: paciente cadastrado em 12/10.
   */
  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!, {
      controllers: [AuditController],
      providers: [...AUDIT_USE_CASES, ...AUDIT_REPOSITORIES, ...AUDIT_SERVICES],
    });
    ({ A, B } = t.tenants);

    ids.patientA = (await t.linkedPatient(A, 'Paciente Alfa'))!;
    ids.patientB = (await t.linkedPatient(B, 'Paciente Beta'))!;

    ids.e1 = await event({
      organizationId: A.id,
      actorUserId: A.users.admin,
      profile: 'admin',
      action: 'user.deactivated',
      entityType: 'user',
      entityId: A.users.caregiver2,
      occurredAt: '2026-10-01T03:00:00Z',
      afterValues: { status: 'inactive', temporaryPassword: 'nunca' },
      ip: '192.0.2.10',
    });
    ids.e2 = await event({
      organizationId: A.id,
      actorUserId: A.users.admin,
      profile: 'admin',
      action: 'user.updated',
      entityType: 'user',
      entityId: A.users.family,
      occurredAt: '2026-11-01T02:59:00Z',
    });
    ids.e3 = await event({
      organizationId: A.id,
      actorUserId: A.users.admin,
      profile: 'admin',
      action: 'user.updated',
      entityType: 'user',
      entityId: A.users.family,
      occurredAt: '2026-11-01T03:00:00Z',
    });
    ids.alert = await event({
      organizationId: A.id,
      actorUserId: null,
      profile: null,
      action: 'alert.generated',
      entityType: 'alert',
      entityId: null,
      occurredAt: '2026-10-15T12:00:00Z',
      afterValues: { severity: 'critical' },
    });
    ids.patientEventA = await event({
      organizationId: A.id,
      actorUserId: A.users.professional,
      profile: 'professional',
      action: 'patient.created',
      entityType: 'patient',
      entityId: ids.patientA,
      occurredAt: '2026-10-10T12:00:00Z',
    });
    ids.patientEventB = await event({
      organizationId: B.id,
      actorUserId: B.users.professional,
      profile: 'professional',
      action: 'patient.created',
      entityType: 'patient',
      entityId: ids.patientB,
      occurredAt: '2026-10-12T12:00:00Z',
    });
  }, 90000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  describe('admin da organizacao', () => {
    it('lista so a propria organizacao no periodo, do mais recente ao mais antigo', async () => {
      const response = await list(A.tokens.admin, OCTOBER);

      expect(response.status).toBe(200);
      expect(dataOf<AuditEventDto[]>(response).map((e) => e.id)).toEqual([
        ids.e2,
        ids.alert,
        ids.patientEventA,
        ids.e1,
      ]);
      expect(metaOf(response).pagination).toEqual({
        page: 1,
        limit: 20,
        total: 4,
        totalPages: 1,
      });
      expect(metaOf(response).message).toBeUndefined();
    });

    it('monta a entrada com autor, perfil, acao, gravidade, item e IP', async () => {
      const [first] = dataOf<AuditEventDto[]>(
        await list(A.tokens.admin, `${OCTOBER}&action=user.deactivated`),
      );

      expect(first).toEqual({
        id: ids.e1,
        occurredAt: '2026-10-01T03:00:00.000Z',
        organization: { id: A.id, name: `Organizacao ${A.code}` },
        actor: {
          type: 'user',
          user: { id: A.users.admin, name: `Admin ${A.code}` },
          profile: { code: 'admin', name: 'Administrador' },
        },
        action: 'user.deactivated',
        actionLabel: 'Inativou usuário',
        severity: 'warning',
        entity: {
          type: 'user',
          id: A.users.caregiver2,
          label: `Usuario cuidador2 ${A.code}`,
        },
        ipAddress: '192.0.2.10',
        requestId: 'req-teste',
      });
    });

    it('mostra o nome do paciente da propria organizacao', async () => {
      const [patient] = dataOf<AuditEventDto[]>(
        await list(A.tokens.admin, `${OCTOBER}&action=patient.created`),
      );

      expect(patient.entity.label).toBe('Paciente Alfa');
    });

    it('pagina mantendo a ordem', async () => {
      expect(
        await listIds(A.tokens.admin, `${OCTOBER}&limit=2&page=2`),
      ).toEqual([ids.patientEventA, ids.e1]);
    });

    it('filtra por usuario, sistema, gravidade e acao', async () => {
      expect(
        await listIds(
          A.tokens.admin,
          `${OCTOBER}&actorUserId=${A.users.professional}`,
        ),
      ).toEqual([ids.patientEventA]);
      expect(
        await listIds(A.tokens.admin, `${OCTOBER}&actorType=system`),
      ).toEqual([ids.alert]);
      expect(
        await listIds(A.tokens.admin, `${OCTOBER}&severity=critical`),
      ).toEqual([ids.alert]);
      expect(
        await listIds(A.tokens.admin, `${OCTOBER}&severity=warning`),
      ).toEqual([ids.e1]);
      expect(
        await listIds(A.tokens.admin, `${OCTOBER}&action=user.updated`),
      ).toEqual([ids.e2]);
    });

    it('busca pelo nome do responsavel ou pelo rotulo da acao', async () => {
      expect(
        await listIds(A.tokens.admin, `${OCTOBER}&search=PROFISSIONAL`),
      ).toEqual([ids.patientEventA]);
      expect(
        await listIds(A.tokens.admin, `${OCTOBER}&search=inativou`),
      ).toEqual([ids.e1]);
      expect(
        await listIds(
          A.tokens.admin,
          `${OCTOBER}&search=${encodeURIComponent('%')}`,
        ),
      ).toEqual([]);
    });

    it('filtro sem resultado responde 200 com lista vazia e mensagem', async () => {
      const response = await list(
        A.tokens.admin,
        'from=2025-01-01&to=2025-01-31',
      );

      expect(response.status).toBe(200);
      expect(dataOf<unknown[]>(response)).toEqual([]);
      expect(metaOf(response).message).toBe(
        'Nenhum evento de auditoria para os filtros selecionados.',
      );
    });

    it('ignora organizationId de outra organizacao', async () => {
      expect(
        await listIds(A.tokens.admin, `${OCTOBER}&organizationId=${B.id}`),
      ).not.toContain(ids.patientEventB);
    });

    it('detalha com os valores gravados e mascara chave sensivel', async () => {
      const response = await t.http(
        'get',
        `/audit-events/${ids.e1}`,
        A.tokens.admin,
      );

      expect(response.status).toBe(200);
      expect(dataOf<AuditEventDetailDto>(response)).toMatchObject({
        id: ids.e1,
        beforeValues: null,
        afterValues: { status: 'inactive', temporaryPassword: '********' },
      });
    });

    it('evento de outra organizacao responde 404', async () => {
      const response = await t.http(
        'get',
        `/audit-events/${ids.patientEventB}`,
        A.tokens.admin,
      );

      expect(response.status).toBe(404);
      expect(errorCode(response)).toBe('AUDIT_EVENT_NOT_FOUND');
    });

    it('periodo acima de 366 dias responde 422', async () => {
      const response = await list(
        A.tokens.admin,
        'from=2025-01-01&to=2026-10-31',
      );

      expect(response.status).toBe(422);
      expect(errorCode(response)).toBe('VALIDATION_FAILED');
    });

    it('lista o catalogo de acoes', async () => {
      const response = await t.http(
        'get',
        '/audit-events/actions',
        A.tokens.admin,
      );
      const actions = dataOf<AuditActionDto[]>(response);

      expect(response.status).toBe(200);
      expect(actions).toContainEqual({
        action: 'alert.generated',
        label: 'Gerou alerta',
        severity: null,
      });
      expect(actions).toContainEqual({
        action: 'audit_events.exported',
        label: 'Exportou a auditoria',
        severity: 'warning',
      });
    });
  });

  describe('master da plataforma', () => {
    it('ve o nome de formulario e medicamento de outra organizacao', async () => {
      const form = await t.scalar(
        `INSERT INTO follow_up_forms (organization_id, name, status)
         VALUES ($1, 'Sinais vitais', 'active') RETURNING id AS value`,
        [B.id],
      );
      const medication = await t.scalar(
        `INSERT INTO medications
           (organization_id, patient_id, created_by_user_id, name, dose_amount, dose_unit)
         VALUES ($1, $2, $3, 'Losartana', 50, 'mg') RETURNING id AS value`,
        [B.id, ids.patientB, B.users.professional],
      );

      for (const [entityType, entityId, action] of [
        ['follow_up_form', form, 'form.created'],
        ['medication', medication, 'medication.created'],
      ] as const) {
        await event({
          organizationId: B.id,
          actorUserId: B.users.professional,
          profile: 'professional',
          action,
          entityType,
          entityId,
          occurredAt: '2026-09-15T12:00:00Z',
        });
      }

      const labels = dataOf<AuditEventDto[]>(
        await list(t.masterToken, 'from=2026-09-15&to=2026-09-15'),
      ).map((e) => e.entity.label);

      expect(labels.sort()).toEqual(['Losartana', 'Sinais vitais']);
    });

    it('ve todas as organizacoes com os nomes de pessoas mascarados', async () => {
      const events = dataOf<AuditEventDto[]>(
        await list(t.masterToken, `${OCTOBER}&action=patient.created`),
      );

      expect(events.map((e) => e.id)).toEqual([
        ids.patientEventB,
        ids.patientEventA,
      ]);
      expect(events.map((e) => e.entity)).toEqual([
        { type: 'patient', id: ids.patientB, label: 'P******* B***' },
        { type: 'patient', id: ids.patientA, label: 'P******* A***' },
      ]);
      expect(events[0].actor.user).toEqual({
        id: B.users.professional,
        name: maskPersonName(`Usuario profissional ${B.code}`),
      });
      expect(events[0].organization.name).toBe(`Organizacao ${B.code}`);
      expect(JSON.stringify(events)).not.toContain('Paciente');
    });

    it('a busca do master nao procura nome de pessoa de outra organizacao', async () => {
      expect(
        await listIds(t.masterToken, `${OCTOBER}&search=profissional`),
      ).toEqual([]);
      expect(
        await listIds(t.masterToken, `${OCTOBER}&search=cadastrou%20paciente`),
      ).toEqual([ids.patientEventB, ids.patientEventA]);
    });

    it('filtra por organizacao e detalha evento de qualquer uma', async () => {
      expect(
        await listIds(t.masterToken, `${OCTOBER}&organizationId=${A.id}`),
      ).toEqual([ids.e2, ids.alert, ids.patientEventA, ids.e1]);

      const detail = await t.http(
        'get',
        `/audit-events/${ids.patientEventB}`,
        t.masterToken,
      );

      expect(detail.status).toBe(200);
      expect(dataOf<AuditEventDetailDto>(detail).organization.id).toBe(B.id);
      expect(dataOf<AuditEventDetailDto>(detail).entity.label).toBe(
        'P******* B***',
      );
    });
  });

  describe('exportacao CSV', () => {
    const exportCsv = (token: string, query: string) =>
      t.http('get', `/audit-events/export?${query}`, token);

    const exportsOf = (organizationId: string) =>
      t.dataSource.query<
        Array<{ actor_user_id: string; after_values: Record<string, unknown> }>
      >(
        `SELECT actor_user_id, after_values FROM audit_events
          WHERE organization_id = $1 AND action = 'audit_events.exported'
          ORDER BY occurred_at, id`,
        [organizationId],
      );

    it('admin exporta so a propria organizacao, sem valores gravados', async () => {
      const response = await exportCsv(A.tokens.admin, OCTOBER);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="auditoria-2026-10-01-a-2026-10-31.csv"',
      );
      expect(response.headers['cache-control']).toBe('private, no-store');

      const lines = response.text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');

      expect(lines).toHaveLength(5);
      expect(lines[1]).toContain('user.updated');
      expect(lines[4]).toContain(';192.0.2.10;');
      expect(response.text).toContain('Paciente Alfa');
      expect(response.text).not.toContain('Paciente Beta');
      expect(response.text).not.toContain('nunca');
    });

    it('repetir o pedido gera o mesmo arquivo e registra cada exportacao', async () => {
      const before = (await exportsOf(B.id)).length;
      const query = `${OCTOBER}&action=patient.created&search=${encodeURIComponent('profissional')}`;
      const first = await exportCsv(B.tokens.admin, query);
      const second = await exportCsv(B.tokens.admin, query);

      expect(first.status).toBe(200);
      expect(second.text).toBe(first.text);
      expect(first.text).toContain('Paciente Beta');

      const records = (await exportsOf(B.id)).slice(before);

      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({
        actor_user_id: B.users.admin,
        after_values: {
          from: '2026-10-01',
          to: '2026-10-31',
          total: 1,
          filters: {
            action: 'patient.created',
            severity: null,
            actorUserId: null,
            actorType: null,
            organizationId: B.id,
            hasSearch: true,
          },
        },
      });
      expect(JSON.stringify(records)).not.toContain('profissional');
    });

    it('a exportacao aparece na consulta como acao de atencao', async () => {
      const [exported] = dataOf<AuditEventDto[]>(
        await list(B.tokens.admin, 'action=audit_events.exported'),
      );

      expect(exported).toMatchObject({
        actionLabel: 'Exportou a auditoria',
        severity: 'warning',
        actor: { profile: { code: 'admin' } },
      });
      expect(['127.0.0.1', '::ffff:127.0.0.1', '::1']).toContain(
        exported.ipAddress,
      );
    });

    it('acima de 10.000 eventos responde 422 e nao registra', async () => {
      await t.dataSource.query(
        `INSERT INTO audit_events (organization_id, actor_type, action, entity_type, occurred_at)
         SELECT $1, 'system', 'alert.generated', 'alert', '2025-03-10T12:00:00Z'
           FROM generate_series(1, 10001)`,
        [B.id],
      );
      const before = (await exportsOf(B.id)).length;
      const response = await exportCsv(
        B.tokens.admin,
        'from=2025-03-01&to=2025-03-31',
      );

      expect(response.status).toBe(422);
      expect(errorCode(response)).toBe('AUDIT_EXPORT_TOO_MANY_EVENTS');
      expect(await exportsOf(B.id)).toHaveLength(before);
    });

    it('master exporta todas as organizacoes e o registro fica na plataforma', async () => {
      const response = await exportCsv(
        t.masterToken,
        `${OCTOBER}&action=patient.created`,
      );

      expect(response.status).toBe(200);
      expect(response.text.trimEnd().split('\r\n')).toHaveLength(3);
      expect(response.text).not.toContain('Paciente Alfa');
      expect(response.text).toContain(';P******* A***;');

      const platform = await t.scalar(
        "SELECT id AS value FROM organizations WHERE kind = 'platform'",
      );

      expect((await exportsOf(platform!)).at(-1)?.after_values).toMatchObject({
        total: 2,
        filters: { organizationId: null },
      });
    });

    it.each(['professional', 'caregiver', 'family'] as const)(
      '%s recebe 403 e nada e registrado',
      async (role) => {
        const before = (await exportsOf(A.id)).length;
        const response = await exportCsv(A.tokens[role], OCTOBER);

        expect(response.status).toBe(403);
        expect(await exportsOf(A.id)).toHaveLength(before);
      },
    );

    it('nenhum evento ou arquivo carrega senha ou token de sessao', async () => {
      const secrets = [
        'senha conhecida de teste',
        A.tokens.admin,
        B.tokens.admin,
        t.masterToken,
      ];
      const dump = await t.scalar(
        `SELECT string_agg(coalesce(after_values::text, '') || coalesce(before_values::text, ''), '|') AS value
           FROM audit_events`,
      );
      const csv = (await exportCsv(t.masterToken, '')).text;

      for (const secret of secrets) {
        expect(dump).not.toContain(secret);
        expect(csv).not.toContain(secret);
      }
    });
  });

  describe('permissao', () => {
    it.each(['professional', 'caregiver', 'family'] as const)(
      '%s recebe 403 na lista, no detalhe e no catalogo',
      async (role) => {
        for (const path of [
          `/audit-events?${OCTOBER}`,
          `/audit-events/${ids.e1}`,
          '/audit-events/actions',
        ]) {
          const response = await t.http('get', path, A.tokens[role]);

          expect(response.status).toBe(403);
          expect(errorCode(response)).toBe('AUTH_FORBIDDEN');
        }
      },
    );
  });
});
