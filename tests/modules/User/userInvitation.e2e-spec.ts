import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import type {
  EmailMessage,
  EmailSender,
} from '@/modules/Notification/channels/emailSender';

import Redis from 'ioredis';

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
    const tenants = {} as Record<'A' | 'B' | 'D' | 'L' | 'X', Tenant>;

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
      await createTenant('D');
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

    describe('consulta e aceite do link', () => {
      /** O limite real por IP (30/h) vale para o teste inteiro; zera a cada caso. */
      const resetInvitationLimit = async () => {
        const client = new Redis(redisUrl!, { lazyConnect: true });

        await client.connect();
        const keys = await client.keys('*auth:invitation-ip:*');

        if (keys.length > 0) await client.del(...keys);
        await client.quit();
      };

      const inspect = (token: string) =>
        http('post', '/auth/invitations/inspect', null, { token });
      const accept = (token: string, newPassword = PASSWORD) =>
        http('post', '/auth/invitations/accept', null, { token, newPassword });

      beforeEach(resetInvitationLimit);

      it('inspect mostra usuario, organizacao, perfil e validade sem consumir', async () => {
        const { email, response } = await invite(tenants.A);
        const token = sender.tokenFor(email);

        for (let round = 0; round < 2; round += 1) {
          const preview = await inspect(token);

          expect(preview.status).toBe(200);
          expect(preview.headers['cache-control']).toBe('no-store');
          expect(dataOf<object>(preview)).toEqual({
            user: { name: 'Ana Convidada', email },
            organization: { code: tenants.A.code, name: 'Organizacao A' },
            profile: { code: 'caregiver', name: expect.any(String) as string },
            expiresAt: dataOf<{ expiresAt: string }>(response).expiresAt,
          });
        }
      });

      it('o aceite ativa o usuario, nao abre sessao e o login entra com a senha escolhida', async () => {
        const { email, id } = await invite(tenants.A);
        const token = sender.tokenFor(email);

        const accepted = await accept(token, 'senha escolhida no convite');

        expect(accepted.status).toBe(200);
        expect(dataOf<object>(accepted)).toEqual({
          organizationCode: tenants.A.code,
          email,
        });
        expect(messageOf(accepted)).toBe(
          'Senha cadastrada. Entre com seu e-mail e a nova senha.',
        );
        expect(JSON.stringify(accepted.body)).not.toContain('accessToken');

        const session = await login(
          tenants.A.code,
          email,
          'senha escolhida no convite',
        );
        expect(session.status).toBe(200);
        expect(dataOf<{ state: string }>(session).state).toBe('authenticated');

        const user = await invitationOf(tenants.A, id);
        expect(user.status).toBe('active');
        expect(user.invitation).toBeNull();
        expect(await invitationRows(id)).toEqual([
          { sent: true, consumed: true, revokedReason: null },
        ]);

        const [acceptedEvent] = await t.dataSource.query<
          Array<{ actor: string; profile: string; ip: string | null }>
        >(
          `SELECT actor_user_id AS actor, actor_profile_code AS profile,
                  host(ip_address) AS ip
             FROM audit_events
            WHERE action = 'user.invitation_accepted' AND entity_id = $1`,
          [id],
        );
        expect(acceptedEvent).toMatchObject({
          actor: id,
          profile: 'caregiver',
        });
        expect(acceptedEvent.ip).not.toBeNull();
      });

      it('segundo aceite, inspect depois do aceite e token inventado respondem o mesmo 422', async () => {
        const { email } = await invite(tenants.A);
        const token = sender.tokenFor(email);

        expect((await accept(token)).status).toBe(200);

        for (const response of [
          await accept(token, 'outra senha qualquer'),
          await inspect(token),
          await inspect('token-que-nao-existe'),
          await accept('token-que-nao-existe'),
        ]) {
          expect(response.status).toBe(422);
          expect(codeOf(response)).toBe('AUTH_INVITATION_INVALID_OR_EXPIRED');
        }

        expect((await login(tenants.A.code, email, PASSWORD)).status).toBe(200);
      });

      it('link vencido responde 422 e o admin ve expired', async () => {
        const { email, id } = await invite(tenants.A);
        const token = sender.tokenFor(email);

        await t.dataSource.query(
          `UPDATE user_invitations SET expires_at = now() - interval '1 second'
            WHERE user_id = $1`,
          [id],
        );

        expect(codeOf(await inspect(token))).toBe(
          'AUTH_INVITATION_INVALID_OR_EXPIRED',
        );
        expect(codeOf(await accept(token))).toBe(
          'AUTH_INVITATION_INVALID_OR_EXPIRED',
        );
        expect((await invitationOf(tenants.A, id)).invitation).toMatchObject({
          channel: 'email',
          status: 'expired',
        });
        expect(
          await scalar('SELECT status AS value FROM users WHERE id = $1', [id]),
        ).toBe('pending');
      });

      it('o link anterior a uma reemissao responde 422 e o novo funciona', async () => {
        const { email, id } = await invite(tenants.A);
        const first = sender.tokenFor(email);

        await reissue(tenants.A, id);
        const second = sender.tokenFor(email);

        expect(second).not.toBe(first);
        expect(codeOf(await accept(first))).toBe(
          'AUTH_INVITATION_INVALID_OR_EXPIRED',
        );
        expect((await accept(second)).status).toBe(200);
      });

      it('o token de envio que falhou nunca vale', async () => {
        sender.results.push({ kind: 'failed', code: 'SMTP_REJECTED' });
        sender.results.push({ kind: 'sent' });

        const { email, id } = await invite(tenants.A);
        // O e-mail nao foi capturado: o token so existe no banco, revogado.
        expect(() => sender.tokenFor(email)).toThrow();
        expect((await invitationOf(tenants.A, id)).invitation?.status).toBe(
          'invalidated',
        );

        await reissue(tenants.A, id);
        expect((await accept(sender.tokenFor(email))).status).toBe(200);
      });

      it('dois aceites simultaneos do mesmo link: um 200 e um 422, em 5 rodadas', async () => {
        for (let round = 0; round < 5; round += 1) {
          const { email } = await invite(tenants.A);
          const token = sender.tokenFor(email);

          const statuses = (
            await Promise.all([accept(token), accept(token)])
          ).map((response) => response.status);

          expect(statuses.sort()).toEqual([200, 422]);
        }
      });

      it('aceite simultaneo a reemissao nunca responde 500 nem vence duas vezes', async () => {
        for (let round = 0; round < 5; round += 1) {
          const { email, id } = await invite(tenants.A);

          const [accepted, reissued] = await Promise.all([
            accept(sender.tokenFor(email)),

            reissue(tenants.A, id),
          ]);

          // Aceite primeiro: reemissao 409. Reemissao primeiro: aceite 422.

          expect(
            [accepted.status, reissued.status].sort((a, b) => a - b),
          ).toEqual(accepted.status === 200 ? [200, 409] : [201, 422]);
        }
      });

      it('mesmo e-mail em A e B: cada token ativa so a propria conta', async () => {
        const email = nextEmail();

        const inA = await createUser(tenants.A, {}, email);
        const tokenA = sender.tokenFor(email);
        const inB = await createUser(tenants.B, {}, email);
        const tokenB = sender.tokenFor(email);

        expect(tokenA).not.toBe(tokenB);

        const acceptedA = await accept(tokenA, 'senha da conta em A');
        expect(dataOf<{ organizationCode: string }>(acceptedA)).toEqual({
          organizationCode: tenants.A.code,
          email,
        });

        const idB = dataOf<{ user: { id: string } }>(inB).user.id;
        expect((await invitationOf(tenants.B, idB)).status).toBe('pending');
        expect(
          (await login(tenants.B.code, email, 'senha da conta em A')).status,
        ).toBe(401);

        expect((await accept(tokenB, 'senha da conta em B')).status).toBe(200);
        expect(
          (await login(tenants.A.code, email, 'senha da conta em A')).status,
        ).toBe(200);
        expect(
          (await login(tenants.B.code, email, 'senha da conta em B')).status,
        ).toBe(200);
        expect(dataOf<{ user: { id: string } }>(inA).user.id).not.toBe(idB);
      });

      it('o limite por IP responde 429 depois de 30 tentativas na hora', async () => {
        const codes: number[] = [];

        for (let attempt = 0; attempt < 31; attempt += 1) {
          codes.push((await inspect(`token-falso-${attempt}`)).status);
        }

        expect(codes.slice(0, 30).every((status) => status === 422)).toBe(true);
        expect(codes[30]).toBe(429);
      });
    });

    describe('revogacoes antes do aceite', () => {
      const resetInvitationLimit = async () => {
        const client = new Redis(redisUrl!, { lazyConnect: true });

        await client.connect();
        const keys = await client.keys('*auth:invitation-ip:*');

        if (keys.length > 0) await client.del(...keys);
        await client.quit();
      };

      const accept = (token: string) =>
        http('post', '/auth/invitations/accept', null, {
          token,
          newPassword: PASSWORD,
        });

      beforeEach(resetInvitationLimit);

      it('inativar o pendente por link responde 200 e mata o link', async () => {
        const { email, id } = await invite(tenants.A);
        const token = sender.tokenFor(email);

        const response = await http(
          'post',
          `/users/${id}/deactivate`,
          tenants.A.adminToken,
        );

        expect(response.status).toBe(200);
        expect(await invitationRows(id)).toEqual([
          { sent: true, consumed: false, revokedReason: 'user_deactivated' },
        ]);
        expect(codeOf(await accept(token))).toBe(
          'AUTH_INVITATION_INVALID_OR_EXPIRED',
        );

        // Reativado sem senha: entra pela redefinicao administrativa (BE-06).
        expect(
          (await http('post', `/users/${id}/reactivate`, tenants.A.adminToken))
            .status,
        ).toBe(200);
        expect((await login(tenants.A.code, email, PASSWORD)).status).toBe(401);
      });

      it('trocar o e-mail do pendente mata o link, apaga a recuperacao e nao reenvia', async () => {
        const { email, id } = await invite(tenants.A);
        const token = sender.tokenFor(email);
        const sentBefore = sender.invitations().length;

        await t.dataSource.query(
          `INSERT INTO password_reset_tokens
             (organization_id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, now() + interval '15 minutes')`,
          [tenants.A.id, id, 'e'.repeat(64)],
        );

        const response = await http(
          'patch',
          `/users/${id}`,
          tenants.A.adminToken,
          { email: nextEmail() },
        );

        expect(response.status).toBe(200);
        expect(
          dataOf<{ invitation: Invitation }>(response).invitation,
        ).toMatchObject({ channel: 'email', status: 'invalidated' });
        expect(sender.invitations()).toHaveLength(sentBefore);
        expect(codeOf(await accept(token))).toBe(
          'AUTH_INVITATION_INVALID_OR_EXPIRED',
        );
        expect(await invitationRows(id)).toEqual([
          { sent: true, consumed: false, revokedReason: 'email_changed' },
        ]);
        expect(
          await scalar(
            'SELECT count(*)::text AS value FROM password_reset_tokens WHERE user_id = $1',
            [id],
          ),
        ).toBe('0');
      });

      it('editar outro campo nao mexe no link', async () => {
        const { email, id } = await invite(tenants.A);

        await http('patch', `/users/${id}`, tenants.A.adminToken, {
          name: 'Ana Renomeada',
        });

        expect((await accept(sender.tokenFor(email))).status).toBe(200);
      });

      it('inativar a organizacao mata os links e reativar nao os restaura', async () => {
        const { email, id } = await invite(tenants.D);
        const token = sender.tokenFor(email);

        expect(
          (
            await http(
              'post',
              `/organizations/${tenants.D.id}/deactivate`,
              masterToken,
            )
          ).status,
        ).toBe(200);
        expect(await invitationRows(id)).toEqual([
          {
            sent: true,
            consumed: false,
            revokedReason: 'organization_deactivated',
          },
        ]);
        expect(codeOf(await accept(token))).toBe(
          'AUTH_INVITATION_INVALID_OR_EXPIRED',
        );

        expect(
          (
            await http(
              'post',
              `/organizations/${tenants.D.id}/reactivate`,
              masterToken,
            )
          ).status,
        ).toBe(200);
        expect(codeOf(await accept(token))).toBe(
          'AUTH_INVITATION_INVALID_OR_EXPIRED',
        );
      });

      it('aceite simultaneo a inativacao nunca responde 500 nem deixa ativo um inativado', async () => {
        for (let round = 0; round < 5; round += 1) {
          const { email, id } = await invite(tenants.A);

          const [accepted, deactivated] = await Promise.all([
            accept(sender.tokenFor(email)),
            http('post', `/users/${id}/deactivate`, tenants.A.adminToken),
          ]);

          expect(deactivated.status).toBe(200);
          expect([200, 422]).toContain(accepted.status);
          expect(
            await scalar('SELECT status AS value FROM users WHERE id = $1', [
              id,
            ]),
          ).toBe('inactive');
        }
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
