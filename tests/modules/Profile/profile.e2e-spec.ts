import {
  PLATFORM_ADMIN_PERMISSIONS,
  TENANT_PROFILES,
} from '@/modules/Access/access.permissions';
import request from 'supertest';

import { PasswordResetRepository } from '@/modules/Auth/repositories/passwordReset.repository';
import { TokenService } from '@/modules/Auth/security/token.service';

import { bootFullApp, type FullApp } from '../../app/fullApp.fixtures';

/**
 * BE-27 de ponta a ponta sobre a API inteira: sessao no login dos cinco tipos
 * de conta, conferida contra o que o guard aplica, e autoatendimento do proprio
 * cadastro em `/profile`, com duas organizacoes, troca de e-mail, revogacao e a
 * migration da permissao.
 */

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const redisUrl = process.env.VITACARE_TEST_REDIS_URL;
const describeWithInfrastructure =
  databaseUrl && redisUrl ? describe : describe.skip;

const PASSWORD = 'senha definitiva do perfil';
const MASKED_CPF = /^\*\*\*\.\d{3}\.\d{3}-\*\*$/;

type Role = 'admin' | 'professional' | 'caregiver' | 'family' | 'spare';

interface Account {
  id: string;
  email: string;
  cpf: string;
  token: string;
}

interface Tenant {
  id: string;
  code: string;
  accounts: Record<Role, Account>;
}

interface Session {
  user: {
    id: string;
    name: string;
    email: string;
    cpf: string;
    phone: string | null;
    status: string;
  };
  profile: { code: string; name: string };
  permissions: string[];
  organization: {
    id: string;
    code: string;
    name: string;
    kind: string;
    plan: { code: string; features: string[]; termStatus: string } | null;
  };
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

let cpfSequence = 0;
const nextCpf = () => {
  cpfSequence += 1;

  return cpfFrom(String(600000000 + cpfSequence * 7919));
};

const dataOf = <T>(response: { body: unknown }) =>
  (response.body as { data: T }).data;
const codeOf = (response: { body: unknown }) =>
  (response.body as { error?: { code: string } }).error?.code;
const sorted = (list: readonly string[]) => [...list].sort();

describeWithInfrastructure('sessao no login e proprio cadastro (BE-27)', () => {
  let t: FullApp;

  const plans: Record<string, string> = {};
  const tenants = {} as Record<'A' | 'B', Tenant>;
  let master: Account;

  const http = (...args: Parameters<FullApp['http']>) => t.http(...args);

  const login = (organizationCode: string, email: string, password: string) =>
    http('post', '/auth/login', null, { organizationCode, email, password });

  const loginToken = async (
    code: string,
    email: string,
    password = PASSWORD,
  ) => {
    const response = await login(code, email, password);

    expect(response.status).toBe(200);

    return dataOf<{ accessToken: string }>(response).accessToken;
  };

  /** Primeiro acesso: confere a sessao restrita e devolve a normal. */
  const activate = async (
    organizationCode: string,
    email: string,
    temporaryPassword: string,
  ) => {
    const restricted = await login(organizationCode, email, temporaryPassword);
    const body = dataOf<{
      state: string;
      accessToken: string;
      idleTimeoutSeconds?: number;
      session: Session;
    }>(restricted);

    expect(body.state).toBe('password_change_required');
    expect(body.idleTimeoutSeconds).toBeUndefined();
    expect(body.session.permissions).toEqual([]);
    expect(body.session.user.email).toBe(email);
    expect(body.session.user.cpf).toMatch(MASKED_CPF);
    expect(body.session.organization.code).toBe(organizationCode);
    expect((await http('get', '/profile', body.accessToken)).status).toBe(401);
    expect(
      (
        await http('post', '/auth/password/first-access', body.accessToken, {
          newPassword: PASSWORD,
        })
      ).status,
    ).toBe(200);

    return loginToken(organizationCode, email);
  };

  const profileOf = async (token: string) => {
    const response = await http('get', '/profile', token);

    expect(response.status).toBe(200);

    return dataOf<Session>(response);
  };

  const auditOf = (userId: string, action: string) =>
    t.dataSource.query<
      Array<{
        actor_user_id: string;
        before_values: unknown;
        after_values: unknown;
      }>
    >(
      `SELECT actor_user_id, before_values, after_values
         FROM audit_events
        WHERE entity_id = $1 AND action = $2
        ORDER BY occurred_at, id`,
      [userId, action],
    );

  beforeAll(async () => {
    t = await bootFullApp(databaseUrl!, redisUrl!);

    const masterCpf = await t.dataSource.query<Array<{ cpf: string }>>(
      'SELECT cpf FROM users WHERE email = $1',
      [t.master.email],
    );

    master = {
      id: '',
      email: t.master.email,
      cpf: masterCpf[0].cpf,
      token: await activate(
        t.master.organizationCode,
        t.master.email,
        t.master.password,
      ),
    };
    master.id = (await profileOf(master.token)).user.id;

    for (const plan of dataOf<Array<{ id: string; code: string }>>(
      await http('get', '/plans', master.token),
    )) {
      plans[plan.code] = plan.id;
    }

    for (const [key, plan] of [
      ['A', 'enterprise'],
      ['B', 'basic'],
    ] as const) {
      const code = `perfil-${key.toLowerCase()}`;
      const adminCpf = nextCpf();
      const created = await http('post', '/organizations', master.token, {
        code,
        tradeName: `Organizacao ${key}`,
        legalName: `Organizacao ${key} Ltda`,
        usagePlanId: plans[plan],
        administrator: {
          name: `Admin ${key}`,
          email: `admin@${code}.test`,
          cpf: adminCpf,
        },
      });

      expect(created.status).toBe(201);

      const body = dataOf<{
        organization: { id: string };
        administrator: { id: string };
        temporaryPassword: string;
      }>(created);
      const accounts = {
        admin: {
          id: body.administrator.id,
          email: `admin@${code}.test`,
          cpf: adminCpf,
          token: await activate(
            code,
            `admin@${code}.test`,
            body.temporaryPassword,
          ),
        },
      } as Record<Role, Account>;

      for (const [role, profileCode] of [
        ['professional', 'professional'],
        ['caregiver', 'caregiver'],
        ['family', 'family'],
        ['spare', 'caregiver'],
      ] as const) {
        const email = `${role}@${code}.test`;
        const cpf = nextCpf();
        const invited = await http('post', '/users', accounts.admin.token, {
          name: `${role} ${key}`,
          email,
          cpf,
          profileCode,
        });

        expect(invited.status).toBe(201);

        const invitedBody = dataOf<{
          temporaryPassword: string;
          user: { id: string };
        }>(invited);

        accounts[role] = {
          id: invitedBody.user.id,
          email,
          cpf,
          token: await activate(code, email, invitedBody.temporaryPassword),
        };
      }

      tenants[key] = { id: body.organization.id, code, accounts };
    }
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 120000);

  describe('sessao no login', () => {
    const cases: Array<{
      label: string;
      account: () => Account;
      organizationCode: () => string;
      profile: string;
      permissions: readonly string[];
      allowed: [Parameters<FullApp['http']>[0], string];
      forbidden: [Parameters<FullApp['http']>[0], string];
    }> = [
      {
        label: 'master',
        account: () => master,
        organizationCode: () => t.master.organizationCode,
        profile: 'platform_admin',
        permissions: PLATFORM_ADMIN_PERMISSIONS,
        allowed: ['get', '/organizations'],
        forbidden: ['get', '/patients'],
      },
      {
        label: 'admin',
        account: () => tenants.A.accounts.admin,
        organizationCode: () => tenants.A.code,
        profile: 'admin',
        permissions: TENANT_PROFILES.admin.permissions,
        allowed: ['get', '/users'],
        forbidden: ['post', '/follow-ups'],
      },
      {
        label: 'profissional',
        account: () => tenants.A.accounts.professional,
        organizationCode: () => tenants.A.code,
        profile: 'professional',
        permissions: TENANT_PROFILES.professional.permissions,
        allowed: ['get', '/patients'],
        forbidden: ['get', '/users'],
      },
      {
        label: 'cuidador',
        account: () => tenants.A.accounts.caregiver,
        organizationCode: () => tenants.A.code,
        profile: 'caregiver',
        permissions: TENANT_PROFILES.caregiver.permissions,
        allowed: ['get', '/forms'],
        forbidden: ['get', '/users'],
      },
      {
        label: 'familiar',
        account: () => tenants.A.accounts.family,
        organizationCode: () => tenants.A.code,
        profile: 'family',
        permissions: TENANT_PROFILES.family.permissions,
        allowed: ['get', '/patients'],
        forbidden: ['get', '/forms'],
      },
    ];

    it.each(cases)(
      '$label: a sessao traz as permissoes que o guard aplica',
      async ({
        account,
        organizationCode,
        profile,
        permissions,
        allowed,
        forbidden,
      }) => {
        const response = await login(
          organizationCode(),
          account().email,
          PASSWORD,
        );

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');

        const body = dataOf<{
          state: string;
          accessToken: string;
          session: Session;
        }>(response);

        expect(body.state).toBe('authenticated');
        expect(body.session.profile.code).toBe(profile);
        expect(body.session.permissions).toEqual(sorted(permissions));
        expect(body.session.permissions).toContain('profile:manage');
        expect(body.session.user.id).toBe(account().id);
        expect(body.session.user.cpf).toMatch(MASKED_CPF);
        expect(body.session.user.cpf).not.toContain(account().cpf);
        expect(JSON.stringify(body)).not.toContain(account().cpf);
        expect(body.session.organization.code).toBe(organizationCode());

        // A propria API autoriza exatamente o que a sessao lista.
        const [allowedMethod, allowedPath] = allowed;
        const [forbiddenMethod, forbiddenPath] = forbidden;

        expect(
          (await http(allowedMethod, allowedPath, body.accessToken)).status,
        ).toBe(200);
        expect(
          (await http(forbiddenMethod, forbiddenPath, body.accessToken, {}))
            .status,
        ).toBe(403);
        expect((await http('get', '/profile', body.accessToken)).status).toBe(
          200,
        );
      },
    );

    it('organizacao e plano: plataforma sem plano, A com painel, B sem painel', async () => {
      const platform = await profileOf(master.token);

      expect(platform.organization).toMatchObject({
        kind: 'platform',
        plan: null,
      });

      const a = await profileOf(tenants.A.accounts.caregiver.token);

      expect(a.organization).toMatchObject({
        id: tenants.A.id,
        code: tenants.A.code,
        name: 'Organizacao A',
        kind: 'tenant',
        plan: { code: 'enterprise', termStatus: 'active' },
      });
      expect(a.organization.plan?.features).toContain('operational_dashboard');

      const b = await profileOf(tenants.B.accounts.admin.token);

      expect(b.organization.plan?.code).toBe('basic');
      expect(b.organization.plan?.features).not.toContain(
        'operational_dashboard',
      );
      expect(JSON.stringify(b)).not.toMatch(/userLimit|patientLimit|price/i);
    });
  });

  describe('GET /profile', () => {
    it('devolve o CPF completo do proprio titular, sem cache', async () => {
      const account = tenants.A.accounts.professional;
      const response = await http('get', '/profile', account.token);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(dataOf<Session>(response).user).toMatchObject({
        id: account.id,
        email: account.email,
        cpf: account.cpf,
        status: 'active',
      });
    });

    it('a sessao da B so ve o proprio cadastro da B', async () => {
      const b = await profileOf(tenants.B.accounts.caregiver.token);

      expect(b.user.id).toBe(tenants.B.accounts.caregiver.id);
      expect(b.organization.id).toBe(tenants.B.id);
      expect(JSON.stringify(b)).not.toContain(tenants.A.id);
    });
  });

  describe('PATCH /profile', () => {
    it('edita nome e telefone so do proprio cadastro e audita sem valores', async () => {
      const account = tenants.A.accounts.caregiver;
      const response = await http('patch', '/profile', account.token, {
        name: '  Cuidador Renomeado  ',
        phone: '(11) 98888-7777',
      });

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(dataOf<Session>(response).user).toMatchObject({
        name: 'Cuidador Renomeado',
        phone: '(11) 98888-7777',
        cpf: account.cpf,
      });

      // O admin ve a mudanca; nenhum outro usuario mudou.
      const seen = await http(
        'get',
        `/users/${account.id}`,
        tenants.A.accounts.admin.token,
      );

      expect(dataOf<{ name: string }>(seen).name).toBe('Cuidador Renomeado');
      expect(
        dataOf<{ name: string }>(
          await http(
            'get',
            `/users/${tenants.A.accounts.spare.id}`,
            tenants.A.accounts.admin.token,
          ),
        ).name,
      ).toBe('spare A');

      const events = await auditOf(account.id, 'profile.updated');

      expect(events).toHaveLength(1);
      expect(events[0].actor_user_id).toBe(account.id);
      expect(events[0].after_values).toEqual({ fields: ['name', 'phone'] });
      expect(JSON.stringify(events[0])).not.toMatch(/Renomeado|98888/);

      const cleared = await http('patch', '/profile', account.token, {
        phone: null,
      });

      expect(dataOf<Session>(cleared).user.phone).toBeNull();
    });

    it('mesmos valores respondem 200 sem gravar nem auditar', async () => {
      const account = tenants.A.accounts.caregiver;
      const before = (await auditOf(account.id, 'profile.updated')).length;
      const response = await http('patch', '/profile', account.token, {
        name: 'Cuidador Renomeado',
        email: account.email.toUpperCase(),
      });

      expect(response.status).toBe(200);
      expect((await auditOf(account.id, 'profile.updated')).length).toBe(
        before,
      );
    });

    it.each([
      ['cpf', { cpf: '52998224725' }],
      ['profile', { profile: 'admin' }],
      ['profileCode', { profileCode: 'admin' }],
      ['status', { status: 'inactive' }],
      [
        'organizationId',
        { organizationId: '00000000-0000-4000-8000-000000000000' },
      ],
      ['id', { id: '00000000-0000-4000-8000-000000000000', name: 'Outro' }],
      ['desconhecido', { apelido: 'Ana' }],
    ])('recusa %s com 422', async (_label, body) => {
      const response = await http(
        'patch',
        '/profile',
        tenants.A.accounts.professional.token,
        body,
      );

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('VALIDATION_FAILED');
    });

    it('corpo vazio e PROFILE_NOTHING_TO_UPDATE; campo invalido e 422', async () => {
      const token = tenants.A.accounts.professional.token;
      const empty = await http('patch', '/profile', token, {});

      expect(empty.status).toBe(422);
      expect(codeOf(empty)).toBe('PROFILE_NOTHING_TO_UPDATE');

      for (const body of [
        { name: '' },
        { email: 'nao-e-email' },
        { phone: 'abc' },
      ]) {
        expect((await http('patch', '/profile', token, body)).status).toBe(422);
      }
    });
  });

  describe('troca de e-mail pelo /profile', () => {
    const NEW_EMAIL = 'profissional.novo@perfil-a.test';

    it('sem senha atual 422, com senha errada 422', async () => {
      const token = tenants.A.accounts.professional.token;
      const missing = await http('patch', '/profile', token, {
        email: NEW_EMAIL,
      });

      expect(missing.status).toBe(422);
      expect(codeOf(missing)).toBe('PROFILE_CURRENT_PASSWORD_REQUIRED');

      const wrong = await http('patch', '/profile', token, {
        email: NEW_EMAIL,
        currentPassword: 'senha totalmente errada',
      });

      expect(wrong.status).toBe(422);
      expect(codeOf(wrong)).toBe('AUTH_CURRENT_PASSWORD_INVALID');
    });

    it('e-mail de outro usuario da organizacao, ativo ou inativo, e 409', async () => {
      const token = tenants.A.accounts.professional.token;
      const taken = await http('patch', '/profile', token, {
        email: tenants.A.accounts.admin.email,
        currentPassword: PASSWORD,
      });

      expect(taken.status).toBe(409);
      expect(codeOf(taken)).toBe('USER_DUPLICATE_EMAIL');

      expect(
        (
          await http(
            'post',
            `/users/${tenants.A.accounts.spare.id}/deactivate`,
            tenants.A.accounts.admin.token,
          )
        ).status,
      ).toBe(200);

      const inactive = await http('patch', '/profile', token, {
        email: tenants.A.accounts.spare.email,
        currentPassword: PASSWORD,
      });

      expect(inactive.status).toBe(409);
      expect(codeOf(inactive)).toBe('USER_DUPLICATE_EMAIL');
    });

    it('troca o e-mail: login novo funciona, antigo falha, link antigo morre, sessoes ficam', async () => {
      const account = tenants.A.accounts.professional;
      const reset = t.app.get(PasswordResetRepository);
      const tokens = t.app.get(TokenService);
      const recovery = tokens.issue();

      await reset.create(
        tenants.A.id,
        account.id,
        recovery.hash,
        new Date(Date.now() + 15 * 60 * 1000),
      );

      const changed = await http('patch', '/profile', account.token, {
        email: NEW_EMAIL.toUpperCase(),
        currentPassword: PASSWORD,
      });

      expect(changed.status).toBe(200);
      expect(dataOf<Session>(changed).user.email).toBe(NEW_EMAIL);

      // A sessao em uso continua valendo.
      expect((await profileOf(account.token)).user.email).toBe(NEW_EMAIL);

      expect(
        (await login(tenants.A.code, account.email, PASSWORD)).status,
      ).toBe(401);

      const fresh = await login(tenants.A.code, NEW_EMAIL, PASSWORD);

      expect(fresh.status).toBe(200);
      expect(dataOf<{ session: Session }>(fresh).session.user.email).toBe(
        NEW_EMAIL,
      );

      const consumed = await http(
        'post',
        '/auth/password-recovery/reset',
        null,
        {
          token: recovery.raw,
          newPassword: 'outra senha qualquer',
        },
      );

      expect(consumed.status).toBe(422);
      expect(codeOf(consumed)).toBe('AUTH_RESET_TOKEN_INVALID_OR_EXPIRED');

      const events = await auditOf(account.id, 'profile.email_changed');

      expect(events).toHaveLength(1);
      expect(events[0].before_values).toBeNull();
      expect(events[0].after_values).toBeNull();
      expect(JSON.stringify(events)).not.toMatch(/@perfil-a\.test/);

      // So o e-mail mudou: nenhum `profile.updated`.
      expect(await auditOf(account.id, 'profile.updated')).toEqual([]);

      account.email = NEW_EMAIL;
    });

    it('nome e e-mail no mesmo PATCH gravam os dois eventos', async () => {
      const account = tenants.A.accounts.family;
      const email = 'familiar.novo@perfil-a.test';
      const response = await http('patch', '/profile', account.token, {
        name: 'Familiar Renomeado',
        email,
        currentPassword: PASSWORD,
      });

      expect(response.status).toBe(200);
      expect(
        (await auditOf(account.id, 'profile.updated'))[0].after_values,
      ).toEqual({ fields: ['name'] });
      expect(await auditOf(account.id, 'profile.email_changed')).toHaveLength(
        1,
      );

      account.email = email;
    });

    it('o mesmo e-mail de outra organizacao e aceito', async () => {
      const account = tenants.B.accounts.caregiver;
      const response = await http('patch', '/profile', account.token, {
        email: tenants.A.accounts.admin.email,
        currentPassword: PASSWORD,
      });

      expect(response.status).toBe(200);
      expect(dataOf<Session>(response).organization.id).toBe(tenants.B.id);
      expect(
        (await login(tenants.B.code, tenants.A.accounts.admin.email, PASSWORD))
          .status,
      ).toBe(200);
      // O admin da A segue intacto na A.
      expect((await profileOf(tenants.A.accounts.admin.token)).user.id).toBe(
        tenants.A.accounts.admin.id,
      );

      account.email = tenants.A.accounts.admin.email;
    });
  });

  describe('revogacao', () => {
    it('permissao retirada do perfil no banco gera 403 na chamada seguinte', async () => {
      const token = tenants.B.accounts.admin.token;
      const revoke = (deleted: boolean) =>
        t.dataSource.query(
          `UPDATE profile_permissions pp
              SET deleted_at = ${deleted ? 'now()' : 'NULL'}
             FROM permissions p, access_profiles ap
            WHERE p.id = pp.permission_id
              AND ap.id = pp.profile_id
              AND p.code = 'profile:manage'
              AND ap.organization_id = $1
              AND ap.code = 'admin'`,
          [tenants.B.id],
        );

      await revoke(true);

      try {
        expect((await http('get', '/profile', token)).status).toBe(403);
        expect(
          (await http('patch', '/profile', token, { name: 'X' })).status,
        ).toBe(403);
        expect(
          (
            await http('put', '/profile/password', token, {
              currentPassword: PASSWORD,
              newPassword: 'senha nova qualquer',
            })
          ).status,
        ).toBe(403);

        const relogged = await login(
          tenants.B.code,
          tenants.B.accounts.admin.email,
          PASSWORD,
        );

        expect(
          dataOf<{ session: Session }>(relogged).session.permissions,
        ).not.toContain('profile:manage');
      } finally {
        await revoke(false);
      }

      expect((await http('get', '/profile', token)).status).toBe(200);
    });

    it('usuario inativado entre requisicoes recebe 401', async () => {
      const account = tenants.B.accounts.family;

      expect((await http('get', '/profile', account.token)).status).toBe(200);
      expect(
        (
          await http(
            'post',
            `/users/${account.id}/deactivate`,
            tenants.B.accounts.admin.token,
          )
        ).status,
      ).toBe(200);
      expect((await http('get', '/profile', account.token)).status).toBe(401);
      expect(
        (await http('patch', '/profile', account.token, { name: 'X' })).status,
      ).toBe(401);
    });
  });

  describe('PUT /profile/password', () => {
    it('mesmos erros da troca em /auth/password', async () => {
      const token = tenants.B.accounts.professional.token;
      const wrong = await http('put', '/profile/password', token, {
        currentPassword: 'senha totalmente errada',
        newPassword: 'senha nova do perfil',
      });

      expect(wrong.status).toBe(422);
      expect(codeOf(wrong)).toBe('AUTH_CURRENT_PASSWORD_INVALID');

      const reuse = await http('put', '/profile/password', token, {
        currentPassword: PASSWORD,
        newPassword: PASSWORD,
      });

      expect(reuse.status).toBe(422);
      expect(codeOf(reuse)).toBe('AUTH_PASSWORD_REUSE');
    });

    it('troca a senha e encerra todas as sessoes do usuario', async () => {
      const account = tenants.B.accounts.professional;
      const other = await loginToken(tenants.B.code, account.email);
      const changed = await http('put', '/profile/password', account.token, {
        currentPassword: PASSWORD,
        newPassword: 'senha nova do perfil',
      });

      expect(changed.status).toBe(200);
      expect(dataOf<null>(changed)).toBeNull();
      expect((await http('get', '/profile', account.token)).status).toBe(401);
      expect((await http('get', '/profile', other)).status).toBe(401);
      expect(
        (await login(tenants.B.code, account.email, PASSWORD)).status,
      ).toBe(401);
      expect(
        (await login(tenants.B.code, account.email, 'senha nova do perfil'))
          .status,
      ).toBe(200);
      expect(await auditOf(account.id, 'auth.password_changed')).toHaveLength(
        1,
      );
    });
  });

  describe('OpenAPI', () => {
    interface Schema {
      properties?: Record<string, { $ref?: string; allOf?: Schema[] }>;
      required?: string[];
      $ref?: string;
    }

    it('publica o bloco session no login e o corpo do PATCH /profile', async () => {
      const response = await request(t.server()).get('/api/docs-json');
      const document = response.body as {
        paths: Record<string, Record<string, { requestBody?: unknown }>>;
        components: { schemas: Record<string, Schema> };
      };
      const schemas = document.components.schemas;

      expect(Object.keys(schemas.LoginResponseDto.properties!)).toContain(
        'session',
      );
      expect(schemas.LoginResponseDto.required).toContain('session');
      expect(Object.keys(schemas.SessionProfileDto.properties!).sort()).toEqual(
        ['organization', 'permissions', 'profile', 'user'],
      );
      expect(Object.keys(schemas.SessionUserDto.properties!)).toContain('cpf');
      expect(
        Object.keys(schemas.UpdateOwnProfileDto.properties!).sort(),
      ).toEqual(['currentPassword', 'email', 'name', 'phone']);
      expect(schemas.UpdateOwnProfileDto.required ?? []).toEqual([]);
      expect(Object.keys(document.paths['/api/v1/profile']).sort()).toEqual([
        'get',
        'patch',
      ]);
      expect(Object.keys(document.paths['/api/v1/profile/password'])).toEqual([
        'put',
      ]);
    });
  });

  describe('migration AddProfileManagePermission', () => {
    it('down tira a permissao de todos; up concede aos perfis das organizacoes existentes', async () => {
      const grants = () =>
        t.dataSource.query<Array<{ org: string; profile: string }>>(
          `SELECT o.code AS org, ap.code AS profile
             FROM profile_permissions pp
             JOIN permissions p ON p.id = pp.permission_id
             JOIN access_profiles ap ON ap.id = pp.profile_id
             JOIN organizations o ON o.id = ap.organization_id
            WHERE p.code = 'profile:manage'
              AND pp.deleted_at IS NULL
            ORDER BY o.code, ap.code`,
        );
      const token = tenants.A.accounts.caregiver.token;

      expect(t.executedMigrations.slice(-3)).toEqual([
        'AddProfileManagePermission1791800000000',
        'CreatePlanExpiryNotices1791900000000',
        'AddManagementReportsPermission1792000000000',
      ]);

      await t.dataSource.undoLastMigration(); // AddManagementReportsPermission (BE-30), que vem depois
      await t.dataSource.undoLastMigration(); // CreatePlanExpiryNotices (BE-28), que vem depois
      await t.dataSource.undoLastMigration();

      try {
        expect(await grants()).toEqual([]);
        expect(
          await t.dataSource.query(
            `SELECT 1 FROM permissions WHERE code = 'profile:manage'`,
          ),
        ).toEqual([]);
        expect((await http('get', '/profile', token)).status).toBe(403);
      } finally {
        await t.dataSource.runMigrations();
      }

      expect(await grants()).toEqual([
        { org: tenants.A.code, profile: 'admin' },
        { org: tenants.A.code, profile: 'caregiver' },
        { org: tenants.A.code, profile: 'family' },
        { org: tenants.A.code, profile: 'professional' },
        { org: tenants.B.code, profile: 'admin' },
        { org: tenants.B.code, profile: 'caregiver' },
        { org: tenants.B.code, profile: 'family' },
        { org: tenants.B.code, profile: 'professional' },
        { org: t.master.organizationCode, profile: 'platform_admin' },
      ]);
      expect((await http('get', '/profile', token)).status).toBe(200);
    });
  });
});
