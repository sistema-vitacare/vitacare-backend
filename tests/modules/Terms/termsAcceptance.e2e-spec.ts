import { createHash } from 'node:crypto';

import request from 'supertest';

import {
  TERMS_V1_CONTENT,
  TERMS_V1_HASH,
  TERMS_V1_TITLE,
} from '@/database/migrations/1792200000001-PublishTermsOfUseV1';

import { bootFullApp, type FullApp } from '../../app/fullApp.fixtures';

/**
 * BE-32 de ponta a ponta sobre a API inteira, com a versao 1 publicada pela
 * migration como em producao: o login sem aceite so le o termo e a propria
 * sessao, aceita e sai; o aceite grava a prova (data, IP, navegador, versao,
 * hash, perfil e requisicao) uma vez so; uma versao nova bloqueia de novo ate
 * em sessao aberta; admin ve so a propria organizacao e o master todas, com
 * nomes de outra organizacao mascarados.
 */

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const redisUrl = process.env.VITACARE_TEST_REDIS_URL;
const describeWithInfrastructure =
  databaseUrl && redisUrl ? describe : describe.skip;

const PASSWORD = 'senha definitiva do termo';
const USER_AGENT = 'vitacare-e2e/1.0';

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

let cpfSequence = 0;
const nextCpf = () => {
  cpfSequence += 1;

  return cpfFrom(String(700000000 + cpfSequence * 7919));
};

const dataOf = <T>(response: { body: unknown }) =>
  (response.body as { data: T }).data;
const codeOf = (response: { body: unknown }) =>
  (response.body as { error?: { code: string } }).error?.code;

interface LoginData {
  state: string;
  accessToken: string;
  session: {
    permissions: string[];
    terms: {
      required: boolean;
      currentVersion: number | null;
      acceptedVersion: number | null;
    };
  };
}

interface AcceptanceItem {
  organization: { id: string; name: string };
  user: { id: string; name: string };
  version: number;
  profileCode: string;
}

describeWithInfrastructure(
  'termo de uso com aceite obrigatorio (BE-32)',
  () => {
    let t: FullApp;
    let masterToken: string;
    const orgs = {} as Record<
      'A' | 'B',
      { id: string; code: string; adminToken: string; adminName: string }
    >;
    let caregiverAToken: string;

    const http = (...args: Parameters<FullApp['http']>) => t.http(...args);

    const login = (organizationCode: string, email: string, password: string) =>
      http('post', '/auth/login', null, { organizationCode, email, password });

    const accept = (token: string, version: number) =>
      http('post', '/terms/acceptances', token, { version }).set(
        'User-Agent',
        USER_AGENT,
      );

    /** Primeiro acesso e novo login: devolve a sessao normal ainda sem aceite. */
    const activate = async (
      organizationCode: string,
      email: string,
      temporaryPassword: string,
    ): Promise<LoginData> => {
      const restricted = await login(
        organizationCode,
        email,
        temporaryPassword,
      );

      expect(dataOf<LoginData>(restricted).state).toBe(
        'password_change_required',
      );
      expect(
        (
          await http(
            'post',
            '/auth/password/first-access',
            dataOf<LoginData>(restricted).accessToken,
            { newPassword: PASSWORD },
          )
        ).status,
      ).toBe(200);

      const session = await login(organizationCode, email, PASSWORD);

      expect(session.status).toBe(200);

      return dataOf<LoginData>(session);
    };

    const acceptanceRows = (userToken?: string) =>
      t.dataSource.query<
        Array<{
          ip_address: string | null;
          user_agent: string | null;
          profile_code: string;
          content_hash: string;
          terms_version: number;
          request_id: string | null;
          accepted_at: Date;
        }>
      >(
        `SELECT host(ip_address) AS ip_address, user_agent, profile_code,
              content_hash, terms_version, request_id, accepted_at
         FROM terms_acceptances a
        WHERE ($1::text IS NULL OR a.user_id = (
                SELECT s.user_id FROM auth_sessions s
                 WHERE s.token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')))
        ORDER BY terms_version`,
        [userToken ?? null],
      );

    const acceptedEvents = async () =>
      Number(
        (
          await t.dataSource.query<Array<{ total: string }>>(
            `SELECT count(*) AS total FROM audit_events WHERE action = 'terms.accepted'`,
          )
        )[0].total,
      );

    beforeAll(async () => {
      t = await bootFullApp(databaseUrl!, redisUrl!);

      const master = await activate(
        t.master.organizationCode,
        t.master.email,
        t.master.password,
      );

      expect(master.state).toBe('terms_acceptance_required');
      masterToken = master.accessToken;
    }, 120000);

    afterAll(async () => {
      await t?.close();
    }, 120000);

    it('publica a versao 1 do repositorio pela migration', async () => {
      const current = await http('get', '/terms/current');

      expect(current.status).toBe(200);
      expect(dataOf(current)).toMatchObject({
        version: 1,
        title: TERMS_V1_TITLE,
        content: TERMS_V1_CONTENT,
        contentHash: TERMS_V1_HASH,
      });
    });

    it('sem aceite, o login autentica mas nao entrega permissoes', async () => {
      const session = await login(
        t.master.organizationCode,
        t.master.email,
        PASSWORD,
      );
      const data = dataOf<LoginData>(session);

      expect(data.state).toBe('terms_acceptance_required');
      expect(data.session.permissions).toEqual([]);
      expect(data.session.terms).toEqual({
        required: true,
        currentVersion: 1,
        acceptedVersion: null,
      });
    });

    it('sem aceite, a sessao so le o termo e a propria sessao, aceita e sai', async () => {
      const blocked = await http('get', '/organizations', masterToken);

      expect(blocked.status).toBe(403);
      expect(codeOf(blocked)).toBe('TERMS_ACCEPTANCE_REQUIRED');
      expect((await http('get', '/plans', masterToken)).status).toBe(403);

      const own = await http('get', '/terms/acceptances/me', masterToken);

      expect(own.status).toBe(200);
      expect(dataOf(own)).toEqual([]);

      const profile = await http('get', '/profile', masterToken);

      expect(profile.status).toBe(200);
      expect(dataOf<LoginData['session']>(profile)).toMatchObject({
        permissions: [],
        terms: { required: true, currentVersion: 1 },
      });

      const spare = dataOf<LoginData>(
        await login(t.master.organizationCode, t.master.email, PASSWORD),
      ).accessToken;

      expect((await http('post', '/auth/logout', spare)).status).toBe(200);
      expect((await http('get', '/profile', spare)).status).toBe(401);
    });

    it('aceitar versao que nao e a vigente responde 422 e nao grava nada', async () => {
      const wrong = await accept(masterToken, 2);

      expect(wrong.status).toBe(422);
      expect(codeOf(wrong)).toBe('TERMS_VERSION_NOT_CURRENT');
      expect(await acceptanceRows()).toEqual([]);
    });

    it('o aceite grava a prova, audita uma vez e libera a sessao aberta', async () => {
      const before = await acceptedEvents();
      const response = await accept(masterToken, 1);

      expect(response.status).toBe(200);
      expect(dataOf(response)).toMatchObject({
        version: 1,
        contentHash: TERMS_V1_HASH,
        alreadyAccepted: false,
      });

      const [row] = await acceptanceRows(masterToken);

      expect(row).toMatchObject({
        user_agent: USER_AGENT,
        profile_code: 'platform_admin',
        content_hash: TERMS_V1_HASH,
        terms_version: 1,
        request_id: (response.body as { meta: { requestId: string } }).meta
          .requestId,
      });
      expect(row.ip_address).not.toBeNull();
      expect(await acceptedEvents()).toBe(before + 1);

      expect((await http('get', '/organizations', masterToken)).status).toBe(
        200,
      );

      const profile = dataOf<LoginData['session']>(
        await http('get', '/profile', masterToken),
      );

      expect(profile.terms).toEqual({
        required: false,
        currentVersion: 1,
        acceptedVersion: 1,
      });
      expect(profile.permissions).toContain('audit_events:read');

      const relogin = dataOf<LoginData>(
        await login(t.master.organizationCode, t.master.email, PASSWORD),
      );

      expect(relogin.state).toBe('authenticated');
    });

    it('aceitar de novo a mesma versao nao duplica nem audita', async () => {
      const before = await acceptedEvents();
      const again = await accept(masterToken, 1);

      expect(again.status).toBe(200);
      expect(dataOf(again)).toMatchObject({ alreadyAccepted: true });
      expect(await acceptanceRows(masterToken)).toHaveLength(1);
      expect(await acceptedEvents()).toBe(before);
    });

    it('duas organizacoes: cada admin aceita no primeiro acesso, inclusive em pedidos simultaneos', async () => {
      const plans = dataOf<Array<{ id: string; code: string }>>(
        await http('get', '/plans', masterToken),
      );

      for (const key of ['A', 'B'] as const) {
        const code = `termo-${key.toLowerCase()}`;
        const adminName = `Paulo Lima ${key}`;
        const created = await http('post', '/organizations', masterToken, {
          code,
          tradeName: `Organizacao ${key}`,
          legalName: `Organizacao ${key} Ltda`,
          usagePlanId: plans.find((plan) => plan.code === 'enterprise')!.id,
          administrator: {
            name: adminName,
            email: `admin@${code}.test`,
            cpf: nextCpf(),
          },
        });

        expect(created.status).toBe(201);

        const body = dataOf<{
          organization: { id: string };
          temporaryPassword: string;
        }>(created);
        const admin = await activate(
          code,
          `admin@${code}.test`,
          body.temporaryPassword,
        );

        expect(admin.state).toBe('terms_acceptance_required');

        orgs[key] = {
          id: body.organization.id,
          code,
          adminToken: admin.accessToken,
          adminName,
        };
      }

      // Quem recusa o termo ainda para o push deste navegador antes de sair
      // (BE-17): a rota chega ao caso de uso, que nao acha a inscricao.
      const revoke = await http(
        'post',
        '/notifications/push-subscriptions/revoke',
        orgs.A.adminToken,
        { endpoint: 'https://fcm.googleapis.com/fcm/send/termo-pendente' },
      );

      expect(revoke.status).toBe(404);
      expect(codeOf(revoke)).toBe('NOTIFICATION_PUSH_SUBSCRIPTION_NOT_FOUND');

      const before = await acceptedEvents();
      const both = await Promise.all([
        accept(orgs.A.adminToken, 1),
        accept(orgs.A.adminToken, 1),
      ]);

      expect(both.map((response) => response.status)).toEqual([200, 200]);
      expect(
        both
          .map((response) => dataOf<{ alreadyAccepted: boolean }>(response))
          .map((data) => data.alreadyAccepted)
          .sort(),
      ).toEqual([false, true]);
      expect(await acceptanceRows(orgs.A.adminToken)).toHaveLength(1);
      expect(await acceptedEvents()).toBe(before + 1);

      expect((await accept(orgs.B.adminToken, 1)).status).toBe(200);

      const invited = await http('post', '/users', orgs.A.adminToken, {
        name: 'Cuidadora A',
        email: `cuidadora@${orgs.A.code}.test`,
        cpf: nextCpf(),
        profileCode: 'caregiver',
      });

      expect(invited.status).toBe(201);

      const caregiver = await activate(
        orgs.A.code,
        `cuidadora@${orgs.A.code}.test`,
        dataOf<{ temporaryPassword: string }>(invited).temporaryPassword,
      );

      expect(caregiver.state).toBe('terms_acceptance_required');
      caregiverAToken = caregiver.accessToken;
      expect((await accept(caregiverAToken, 1)).status).toBe(200);
    });

    it('o admin ve so os aceites da propria organizacao, mesmo pedindo outra', async () => {
      for (const query of ['', `?organizationId=${orgs.B.id}`]) {
        const response = await http(
          'get',
          `/terms/acceptances${query}`,
          orgs.A.adminToken,
        );

        expect(response.status).toBe(200);

        const items = dataOf<AcceptanceItem[]>(response);

        expect(items).toHaveLength(2);
        expect(new Set(items.map((item) => item.organization.id))).toEqual(
          new Set([orgs.A.id]),
        );
        expect(items.map((item) => item.profileCode).sort()).toEqual([
          'admin',
          'caregiver',
        ]);
        expect(items.map((item) => item.user.name)).toContain(orgs.A.adminName);
      }
    });

    it('o master ve todas as organizacoes, com nomes de outra organizacao mascarados', async () => {
      const all = dataOf<AcceptanceItem[]>(
        await http('get', '/terms/acceptances', masterToken),
      );

      expect(all).toHaveLength(4);

      const adminB = all.find((item) => item.organization.id === orgs.B.id)!;

      expect(adminB.user.name).toBe('P**** L*** B');
      expect(
        all.find((item) => item.profileCode === 'platform_admin')!.user.name,
      ).toBe('Master Homologacao');

      const onlyB = dataOf<AcceptanceItem[]>(
        await http(
          'get',
          `/terms/acceptances?organizationId=${orgs.B.id}`,
          masterToken,
        ),
      );

      expect(onlyB.map((item) => item.organization.id)).toEqual([orgs.B.id]);
    });

    it('cuidador nao consulta os aceites da organizacao, so os proprios', async () => {
      const forbidden = await http(
        'get',
        '/terms/acceptances',
        caregiverAToken,
      );

      expect(forbidden.status).toBe(403);
      expect(codeOf(forbidden)).toBe('AUTH_FORBIDDEN');
      expect(
        dataOf<Array<{ version: number }>>(
          await http('get', '/terms/acceptances/me', caregiverAToken),
        ).map((item) => item.version),
      ).toEqual([1]);
    });

    it('uma versao nova bloqueia de novo, ate em sessao aberta, e guarda os aceites antigos', async () => {
      expect((await http('get', '/users', orgs.A.adminToken)).status).toBe(200);

      const content = '# Termo de Uso v2\n\nVersão 2\n\nTexto novo.\n';

      await t.dataSource.query(
        `INSERT INTO terms_versions (version, title, content, content_hash, published_at)
       VALUES (2, 'Termo de Uso v2', $1, $2, now())`,
        [content, createHash('sha256').update(content, 'utf8').digest('hex')],
      );

      const blocked = await http('get', '/users', orgs.A.adminToken);

      expect(blocked.status).toBe(403);
      expect(codeOf(blocked)).toBe('TERMS_ACCEPTANCE_REQUIRED');
      expect((await accept(orgs.A.adminToken, 1)).status).toBe(422);
      expect((await accept(orgs.A.adminToken, 2)).status).toBe(200);
      expect((await http('get', '/users', orgs.A.adminToken)).status).toBe(200);

      expect(
        dataOf<Array<{ version: number }>>(
          await http('get', '/terms/acceptances/me', orgs.A.adminToken),
        ).map((item) => item.version),
      ).toEqual([2, 1]);
      expect(
        (await acceptanceRows(orgs.A.adminToken)).map(
          (row) => row.terms_version,
        ),
      ).toEqual([1, 2]);

      // Quem ainda nao aceitou a 2 volta a ver o estado no login.
      const relogin = dataOf<LoginData>(
        await login(orgs.B.code, `admin@${orgs.B.code}.test`, PASSWORD),
      );

      expect(relogin.state).toBe('terms_acceptance_required');
      expect(relogin.session.terms).toEqual({
        required: true,
        currentVersion: 2,
        acceptedVersion: 1,
      });

      // A versao 1 continua legivel como prova.
      const v1 = await http('get', '/terms/versions/1');

      expect(dataOf<{ contentHash: string }>(v1).contentHash).toBe(
        TERMS_V1_HASH,
      );
    });

    it('a pagina e o JSON abrem sem login e mostram o mesmo texto', async () => {
      const json = dataOf<{ title: string; version: number }>(
        await http('get', '/terms/current'),
      );
      const page = await request(t.server()).get('/termos');

      expect(page.status).toBe(200);
      expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(page.text).toContain(`<title>${json.title}</title>`);
      expect(page.text).toContain('Texto novo.');
      expect(page.text).toContain(`Versão ${json.version}`);

      const old = await request(t.server()).get('/termos?versao=1');

      expect(old.text).toContain('O que o VitaCare não é');
    });
  },
);
