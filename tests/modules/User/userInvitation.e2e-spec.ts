import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import type {
  EmailMessage,
  EmailSender,
} from '@/modules/Notification/channels/emailSender';

import { bootFullApp, type FullApp } from '../../app/fullApp.fixtures';

/**
 * BE-31 de ponta a ponta na API inteira (PostgreSQL e Redis reais): convite
 * por link com a porta SMTP trocada por uma fake que captura as mensagens e
 * pode falhar sob comando; o modo senha provisoria continua como antes.
 */

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const redisUrl = process.env.VITACARE_TEST_REDIS_URL;
const describeWithInfrastructure =
  databaseUrl && redisUrl ? describe : describe.skip;

const PASSWORD = 'senha definitiva do convite';
const INVITATION_SUBJECT = 'Convite para acessar o VitaCare';

/** Porta SMTP falsa: guarda as mensagens e devolve o resultado da fila. */
class FakeEmailSender implements EmailSender {
  enabled = true;
  readonly messages: EmailMessage[] = [];
  readonly results: DeliveryResult[] = [];

  send(message: EmailMessage): Promise<DeliveryResult> {
    const result = this.results.shift() ?? { kind: 'sent' };

    if (result.kind === 'sent') this.messages.push(message);

    return Promise.resolve(result);
  }

  invitations(): EmailMessage[] {
    return this.messages.filter((m) => m.subject === INVITATION_SUBJECT);
  }

  tokenFor(email: string): string {
    const message = this.invitations()
      .filter((m) => m.to === email)
      .at(-1);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];

    if (!link) throw new Error(`Nenhum convite capturado para ${email}.`);

    return new URL(link).searchParams.get('token')!;
  }
}

const cpfFrom = (base: string): string => {
  const digit = (digits: string, weightStart: number) => {
    const sum = [...digits].reduce(
      (total, value, index) => total + Number(value) * (weightStart - index),
      0,
    );
    const remainder = (sum * 10) % 11;

    return remainder === 10 ? 0 : remainder;
  };
  const first = digit(base, 10);

  return `${base}${first}${digit(`${base}${first}`, 11)}`;
};

let sequence = 0;
const nextCpf = () => {
  sequence += 1;

  return cpfFrom(String(600000000 + sequence * 7919));
};
const nextEmail = () => {
  sequence += 1;

  return `convidado-${sequence}@example.test`;
};

const dataOf = <T>(response: { body: unknown }) =>
  (response.body as { data: T }).data;
const codeOf = (response: { body: unknown }) =>
  (response.body as { error?: { code: string } }).error?.code;
const messageOf = (response: { body: unknown }) =>
  (response.body as { meta: { message?: string } }).meta.message;

interface Invitation {
  channel: string;
  status: string;
  expiresAt: string;
  sentAt: string | null;
}

interface Tenant {
  code: string;
  id: string;
  adminToken: string;
}

describeWithInfrastructure(
  'convite por e-mail com link de aceite (e2e)',
  () => {
    let t: FullApp;
    const sender = new FakeEmailSender();
    let masterToken: string;
    const tenants = {} as Record<'A' | 'B' | 'L' | 'X', Tenant>;

    const http = (...args: Parameters<FullApp['http']>) => t.http(...args);

    const scalar = async (sql: string, parameters: unknown[] = []) => {
      const rows: Array<{ value: string | null }> = await t.dataSource.query(
        sql,
        parameters,
      );

      return rows[0]?.value ?? null;
    };

    const login = (organizationCode: string, email: string, password: string) =>
      http('post', '/auth/login', null, { organizationCode, email, password });

    const activate = async (code: string, email: string, temporary: string) => {
      const restricted = await login(code, email, temporary);
      const token = dataOf<{ accessToken: string }>(restricted).accessToken;

      expect(
        (
          await http('post', '/auth/password/first-access', token, {
            newPassword: PASSWORD,
          })
        ).status,
      ).toBe(200);

      return dataOf<{ accessToken: string }>(await login(code, email, PASSWORD))
        .accessToken;
    };

    const createTenant = async (key: keyof typeof tenants, planId?: string) => {
      const code = `convite-${key.toLowerCase()}`;
      const plans = dataOf<Array<{ id: string; code: string }>>(
        await http('get', '/plans', masterToken),
      );
      const created = await http('post', '/organizations', masterToken, {
        code,
        tradeName: `Organizacao ${key}`,
        usagePlanId:
          planId ?? plans.find((plan) => plan.code === 'enterprise')!.id,
        administrator: {
          name: `Admin ${key}`,
          email: `admin@${code}.test`,
          cpf: nextCpf(),
        },
      });

      expect(created.status).toBe(201);

      const body = dataOf<{
        organization: { id: string };
        temporaryPassword: string;
      }>(created);

      tenants[key] = {
        code,
        id: body.organization.id,
        adminToken: await activate(
          code,
          `admin@${code}.test`,
          body.temporaryPassword,
        ),
      };
    };

    const createUser = (
      tenant: Tenant,
      body: Record<string, unknown> = {},
      email = nextEmail(),
    ) =>
      http('post', '/users', tenant.adminToken, {
        name: 'Ana Convidada',
        email,
        cpf: nextCpf(),
        profileCode: 'caregiver',
        ...body,
      });

    const invite = async (
      tenant: Tenant,
      body: Record<string, unknown> = {},
    ) => {
      const email = nextEmail();
      const response = await createUser(tenant, body, email);

      expect(response.status).toBe(201);

      return {
        email,
        response,
        id: dataOf<{ user: { id: string } }>(response).user.id,
      };
    };

    const invitationOf = async (tenant: Tenant, userId: string) =>
      dataOf<{ status: string; invitation: Invitation | null }>(
        await http('get', `/users/${userId}`, tenant.adminToken),
      );

    const invitationRows = (userId: string) =>
      t.dataSource.query<
        Array<{
          sent: boolean;
          consumed: boolean;
          revokedReason: string | null;
        }>
      >(
        `SELECT sent_at IS NOT NULL AS sent,
              consumed_at IS NOT NULL AS consumed,
              revoked_reason AS "revokedReason"
         FROM user_invitations
        WHERE user_id = $1
        ORDER BY created_at, id`,
        [userId],
      );

    const auditActions = async (userId: string) =>
      (
        await t.dataSource.query<
          Array<{ action: string; afterValues: unknown }>
        >(
          `SELECT action, after_values AS "afterValues"
           FROM audit_events
          WHERE entity_id = $1
          ORDER BY occurred_at, id`,
          [userId],
        )
      ).map((row) => ({ action: row.action, afterValues: row.afterValues }));

    const reissue = (tenant: Tenant, userId: string, body?: object) =>
      http('post', `/users/${userId}/invitation`, tenant.adminToken, body);

    beforeAll(async () => {
      t = await bootFullApp(databaseUrl!, redisUrl!, { emailSender: sender });

      const master = await login(
        t.master.organizationCode,
        t.master.email,
        t.master.password,
      );

      await http(
        'post',
        '/auth/password/first-access',
        dataOf<{ accessToken: string }>(master).accessToken,
        { newPassword: PASSWORD },
      );
      masterToken = dataOf<{ accessToken: string }>(
        await login(t.master.organizationCode, t.master.email, PASSWORD),
      ).accessToken;

      const tightPlan = (await scalar(
        `INSERT INTO usage_plans (code, name, user_limit, patient_limit)
       VALUES ('convite-apertado', 'Plano apertado', 2, 10) RETURNING id AS value`,
      ))!;

      await createTenant('A');
      await createTenant('B');
      await createTenant('L', tightPlan);
      await createTenant('X');
    }, 180000);

    afterAll(async () => {
      await t?.close();
    }, 180000);

    describe('cadastro com SMTP ligado', () => {
      it('envia o link e responde sem senha, com o convite pendente e enviado', async () => {
        const { email, response, id } = await invite(tenants.A);
        const data = dataOf<{
          user: { status: string; invitation: Invitation };
          channel: string;
          expiresAt: string;
          delivery: { status: string };
        }>(response);

        expect(response.headers['cache-control']).toBe('no-store');
        expect(data).not.toHaveProperty('temporaryPassword');
        expect(data).toMatchObject({
          channel: 'email',
          delivery: { status: 'sent' },
          user: {
            status: 'pending',
            invitation: { channel: 'email', status: 'pending' },
          },
        });
        expect(data.user.invitation.sentAt).not.toBeNull();
        expect(data.user.invitation.expiresAt).toBe(data.expiresAt);
        expect(new Date(data.expiresAt).getTime() - Date.now()).toBeGreaterThan(
          71 * 3600 * 1000,
        );
        expect(messageOf(response)).toMatch(/^Convite enviado ao e-mail/);

        const message = sender.invitations().at(-1)!;
        expect(message.to).toBe(email);
        expect(message.text).toContain('Organizacao A');
        expect(message.text).toContain('"convite-a"');
        expect(message.text).toContain('Admin A convidou você');
        expect(message.text).toContain(
          'https://app.example.test/aceitar-convite?token=',
        );

        expect(
          await scalar(
            'SELECT (password_hash IS NULL)::text AS value FROM users WHERE id = $1',
            [id],
          ),
        ).toBe('true');
        expect(await invitationRows(id)).toEqual([
          { sent: true, consumed: false, revokedReason: null },
        ]);
      });

      it('audita cadastro e envio sem token, e-mail nem nome', async () => {
        const { email, id } = await invite(tenants.A);
        const token = sender.tokenFor(email);
        const actions = await auditActions(id);

        expect(actions.map((entry) => entry.action)).toEqual([
          'user.created',
          'user.invitation_sent',
        ]);
        expect(actions[0].afterValues).toEqual({
          profile: 'caregiver',
          channel: 'email',
        });

        const serialized = JSON.stringify(actions);
        expect(serialized).not.toContain(token);
        expect(serialized).not.toContain(email);
        expect(serialized).not.toContain('Ana Convidada');
      });

      it('o login antes do aceite responde 401, como credencial invalida', async () => {
        const { email } = await invite(tenants.A);

        const response = await login(tenants.A.code, email, 'qualquer senha');

        expect(response.status).toBe(401);
        expect(codeOf(response)).toBe('AUTH_INVALID_CREDENTIALS');
      });

      it('o admin ainda pode pedir a senha provisoria', async () => {
        const before = sender.invitations().length;
        const { response, id } = await invite(tenants.A, {
          channel: 'temporary_password',
        });

        expect(
          dataOf<{ channel: string; temporaryPassword: string }>(response),
        ).toMatchObject({ channel: 'temporary_password' });
        expect(
          dataOf<{ temporaryPassword: string }>(response).temporaryPassword,
        ).toHaveLength(20);
        expect(sender.invitations()).toHaveLength(before);
        expect(await invitationRows(id)).toEqual([]);
        expect((await invitationOf(tenants.A, id)).invitation).toMatchObject({
          channel: 'temporary_password',
          status: 'pending',
          sentAt: null,
        });
      });
    });

    describe('falha do SMTP', () => {
      it('cadastra, revoga o link na hora e orienta a reemitir', async () => {
        sender.results.push({ kind: 'retry', code: 'SMTP_UNAVAILABLE' });

        const { response, id } = await invite(tenants.A);

        expect(response.status).toBe(201);
        expect(
          dataOf<{ delivery: { status: string } }>(response).delivery,
        ).toEqual({ status: 'failed' });
        expect(dataOf<object>(response)).not.toHaveProperty(
          'temporaryPassword',
        );
        expect(messageOf(response)).toBe(
          'Não foi possível enviar o convite por e-mail. Reemita o convite ou gere uma senha provisória.',
        );
        expect(await invitationRows(id)).toEqual([
          { sent: false, consumed: false, revokedReason: 'send_failed' },
        ]);
        expect((await invitationOf(tenants.A, id)).invitation).toMatchObject({
          channel: 'email',
          status: 'invalidated',
          sentAt: null,
        });
        expect((await auditActions(id)).map((entry) => entry.action)).toEqual([
          'user.created',
          'user.invitation_failed',
        ]);
      });
    });

    describe('reemissao e troca de canal', () => {
      it('de link para link: o anterior morre como reissued e o novo sai', async () => {
        const { email, id } = await invite(tenants.A);

        const response = await reissue(tenants.A, id);

        expect(response.status).toBe(201);
        expect(dataOf<object>(response)).toMatchObject({
          channel: 'email',
          delivery: { status: 'sent' },
        });
        expect(dataOf<object>(response)).not.toHaveProperty('user');
        expect(sender.invitations().filter((m) => m.to === email)).toHaveLength(
          2,
        );
        expect(await invitationRows(id)).toEqual([
          { sent: true, consumed: false, revokedReason: 'reissued' },
          { sent: true, consumed: false, revokedReason: null },
        ]);
        expect((await auditActions(id)).at(-2)).toEqual({
          action: 'user.invitation_reissued',
          afterValues: { channel: 'email' },
        });
      });

      it('de link para senha: o link morre como channel_changed e a senha entra', async () => {
        const { email, id } = await invite(tenants.A);

        const response = await reissue(tenants.A, id, {
          channel: 'temporary_password',
        });
        const temporary = dataOf<{ temporaryPassword: string }>(
          response,
        ).temporaryPassword;

        expect(response.status).toBe(201);
        expect(await invitationRows(id)).toEqual([
          { sent: true, consumed: false, revokedReason: 'channel_changed' },
        ]);
        expect((await invitationOf(tenants.A, id)).invitation).toMatchObject({
          channel: 'temporary_password',
          status: 'pending',
        });
        expect((await login(tenants.A.code, email, temporary)).status).toBe(
          200,
        );
      });

      it('de senha para link: a senha deixa de valer e a sessao restrita cai', async () => {
        const { email, response, id } = await invite(tenants.A, {
          channel: 'temporary_password',
        });
        const temporary = dataOf<{ temporaryPassword: string }>(
          response,
        ).temporaryPassword;
        const restricted = dataOf<{ accessToken: string }>(
          await login(tenants.A.code, email, temporary),
        ).accessToken;

        expect(
          (await reissue(tenants.A, id, { channel: 'email' })).status,
        ).toBe(201);

        expect((await login(tenants.A.code, email, temporary)).status).toBe(
          401,
        );
        expect(
          (
            await http('post', '/auth/password/first-access', restricted, {
              newPassword: PASSWORD,
            })
          ).status,
        ).toBe(401);
        expect((await invitationOf(tenants.A, id)).invitation).toMatchObject({
          channel: 'email',
          status: 'pending',
        });
        expect(
          await scalar(
            `SELECT (password_hash IS NULL AND NOT must_change_password
                   AND temporary_password_expires_at IS NULL)::text AS value
             FROM users WHERE id = $1`,
            [id],
          ),
        ).toBe('true');
      });

      it('reemissao com falha deixa nenhum link valido', async () => {
        const { id } = await invite(tenants.A);
        sender.results.push({ kind: 'failed', code: 'SMTP_REJECTED' });

        const response = await reissue(tenants.A, id);

        expect(
          dataOf<{ delivery: { status: string } }>(response).delivery,
        ).toEqual({ status: 'failed' });
        expect(await invitationRows(id)).toEqual([
          { sent: true, consumed: false, revokedReason: 'reissued' },
          { sent: false, consumed: false, revokedReason: 'send_failed' },
        ]);
      });
    });

    describe('plano e organizacoes', () => {
      it('no limite do plano responde 409 sem convite nem mensagem', async () => {
        const first = await createUser(tenants.L);
        expect(first.status).toBe(201);

        const before = sender.invitations().length;
        const blocked = await createUser(tenants.L);

        expect(blocked.status).toBe(409);
        expect(codeOf(blocked)).toBe('USER_PLAN_LIMIT_REACHED');
        expect(sender.invitations()).toHaveLength(before);
        expect(
          await scalar(
            `SELECT count(*)::text AS value FROM user_invitations
            WHERE organization_id = $1`,
            [tenants.L.id],
          ),
        ).toBe('1');
      });

      it('com a vigencia vencida responde 409 antes de qualquer convite', async () => {
        await t.dataSource.query(
          `UPDATE organization_plan_terms
              SET starts_at = now() - interval '2 days',
                  ends_at = now() - interval '1 hour'
            WHERE organization_id = $1
              AND superseded_at IS NULL`,
          [tenants.X.id],
        );
        const before = sender.invitations().length;

        const blocked = await createUser(tenants.X);

        expect(blocked.status).toBe(409);
        expect(codeOf(blocked)).toBe('USER_PLAN_EXPIRED');
        expect(sender.invitations()).toHaveLength(before);
        expect(
          await scalar(
            `SELECT count(*)::text AS value FROM user_invitations
            WHERE organization_id = $1`,
            [tenants.X.id],
          ),
        ).toBe('0');
      });

      it('o admin de A nao reemite convite de usuario de B', async () => {
        const { id } = await invite(tenants.B);

        const response = await reissue(tenants.A, id);

        expect(response.status).toBe(404);
        expect(codeOf(response)).toBe('USER_NOT_FOUND');
      });
    });
  },
);
