import { DomainException } from '@/common/errors/domain.exception';

import { LoginUseCase } from '@/modules/Auth/Login/login.useCase';
import type {
  LoginIdentity,
  SessionProfileRow,
} from '@/modules/Auth/types/auth.types';

const activeIdentity: LoginIdentity = {
  userId: 'user-1',
  organizationId: 'org-1',
  passwordHash: 'hash',
  mustChangePassword: false,
  status: 'active',
  deletedAt: null,
  organizationStatus: 'active',
  organizationDeletedAt: null,
  temporaryPasswordExpiresAt: null,
  profile: 'admin' as never,
  permissions: new Set<string>(),
};

const sessionRow: SessionProfileRow = {
  user: {
    id: 'user-1',
    name: 'Ana Exemplo',
    email: 'user@example.test',
    cpf: '52998224725',
    phone: null,
    status: 'active',
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
  },
  profile: { code: 'admin' as never, name: 'Administrador' },
  permissions: ['users:read', 'alerts:read', 'profile:manage'],
  organization: {
    id: 'org-1',
    code: 'clinica-a',
    tradeName: 'Clinica A',
    legalName: null,
    kind: 'tenant',
    status: 'active',
    plan: {
      code: 'basic',
      name: 'Basic',
      features: ['patient_management'],
      termStatus: 'active',
    },
  },
  terms: { currentVersion: null, acceptedVersion: null },
};

const credentials = {
  organizationCode: 'clinica-a',
  email: 'user@example.test',
  password: 'senha válida',
};

const durations: Record<string, number> = {
  'auth.sessionIdleSeconds': 1800,
  'auth.sessionAbsoluteSeconds': 43200,
  'auth.firstAccessSeconds': 600,
};

interface Doubles {
  identity?: LoginIdentity | null;
  organizationId?: string | null;
  session?: SessionProfileRow | null;
  passwordMatches?: boolean;
  createLoginSession?: jest.Mock;
  assertLoginAllowed?: jest.Mock;
}

const build = (doubles: Doubles = {}) => {
  const identity =
    doubles.identity === undefined ? activeIdentity : doubles.identity;

  const organizationId =
    doubles.organizationId === undefined
      ? (identity?.organizationId ?? 'org-1')
      : doubles.organizationId;

  const identities = {
    findForAuthentication: jest
      .fn()
      .mockResolvedValue({ organizationId, identity }),
    findSessionProfile: jest
      .fn()
      .mockResolvedValue(
        doubles.session === undefined ? sessionRow : doubles.session,
      ),
  };

  const transactions = {
    createLoginSession:
      doubles.createLoginSession ?? jest.fn().mockResolvedValue(true),
    recordLoginFailure: jest.fn().mockResolvedValue(undefined),
  };

  const limiter = {
    assertLoginAllowed:
      doubles.assertLoginAllowed ?? jest.fn().mockResolvedValue(undefined),
    recordLoginFailure: jest.fn().mockResolvedValue(undefined),
    clearLoginFailures: jest.fn().mockResolvedValue(undefined),
  };

  const passwords = {
    verify: jest.fn().mockResolvedValue(doubles.passwordMatches ?? true),
    verifyDummy: jest.fn().mockResolvedValue(false),
  };

  const tokens = {
    issue: jest.fn().mockReturnValue({ raw: 'token', hash: 'hash-token' }),
  };

  const config = { getOrThrow: jest.fn((key: string) => durations[key]) };

  const useCase = new LoginUseCase(
    identities as never,
    transactions as never,
    limiter as never,
    passwords as never,
    tokens as never,
    config as never,
  );

  return { useCase, identities, transactions, limiter, passwords, tokens };
};

const expectInvalidCredentials = async (doubles: Doubles): Promise<void> => {
  const { useCase, limiter, transactions, identities } = build(doubles);

  await expect(
    useCase.execute(credentials, { ip: '127.0.0.1' }),
  ).rejects.toMatchObject<Partial<DomainException>>({
    code: 'AUTH_INVALID_CREDENTIALS',
    fields: null,
  });

  expect(limiter.recordLoginFailure).toHaveBeenCalledWith(
    'clinica-a',
    'user@example.test',
    '127.0.0.1',
  );
  expect(transactions.createLoginSession).not.toHaveBeenCalled();
  expect(identities.findSessionProfile).not.toHaveBeenCalled();
};

describe('LoginUseCase', () => {
  it('devolve a sessao com CPF mascarado e permissoes ordenadas (BE-27)', async () => {
    const { useCase, identities } = build();

    const result = await useCase.execute(credentials, { ip: '127.0.0.1' });

    expect(identities.findSessionProfile).toHaveBeenCalledWith(
      'user-1',
      'org-1',
    );
    expect(result.session).toEqual({
      user: {
        id: 'user-1',
        name: 'Ana Exemplo',
        email: 'user@example.test',
        cpf: '***.982.247-**',
        phone: null,
        status: 'active',
        createdAt: '2026-11-01T12:00:00.000Z',
      },
      profile: { code: 'admin', name: 'Administrador' },
      permissions: ['alerts:read', 'profile:manage', 'users:read'],
      organization: {
        id: 'org-1',
        code: 'clinica-a',
        name: 'Clinica A',
        legalName: null,
        kind: 'tenant',
        status: 'active',
        plan: {
          code: 'basic',
          name: 'Basic',
          features: ['patient_management'],
          termStatus: 'active',
        },
      },
      terms: { required: false, currentVersion: null, acceptedVersion: null },
    });
  });

  describe('termo de uso (BE-32)', () => {
    const withTerms = (
      currentVersion: number | null,
      acceptedVersion: number | null,
    ): SessionProfileRow => ({
      ...sessionRow,
      terms: { currentVersion, acceptedVersion },
    });

    it('sem aceite da vigente: sessao normal, estado terms_acceptance_required e nenhuma permissao', async () => {
      const { useCase, transactions } = build({ session: withTerms(2, 1) });

      const result = await useCase.execute(credentials, { ip: '127.0.0.1' });

      expect(result.state).toBe('terms_acceptance_required');
      expect(result.idleTimeoutSeconds).toBe(1800);
      expect(result.session.permissions).toEqual([]);
      expect(result.session.terms).toEqual({
        required: true,
        currentVersion: 2,
        acceptedVersion: 1,
      });
      expect(transactions.createLoginSession).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'normal' }),
      );
    });

    it('com a vigente aceita: authenticated com as permissoes', async () => {
      const { useCase } = build({ session: withTerms(2, 2) });

      const result = await useCase.execute(credentials, { ip: '127.0.0.1' });

      expect(result.state).toBe('authenticated');
      expect(result.session.permissions).toEqual([
        'alerts:read',
        'profile:manage',
        'users:read',
      ]);
      expect(result.session.terms.required).toBe(false);
    });

    it('a troca obrigatoria de senha vem antes do termo', async () => {
      const { useCase } = build({
        identity: { ...activeIdentity, mustChangePassword: true },
        session: withTerms(1, null),
      });

      const result = await useCase.execute(credentials, { ip: '127.0.0.1' });

      expect(result.state).toBe('password_change_required');
      expect(result.idleTimeoutSeconds).toBeUndefined();
      expect(result.session.permissions).toEqual([]);
    });
  });

  it('sessao restrita identifica o usuario sem nenhuma permissao (BE-27)', async () => {
    const { useCase } = build({
      identity: { ...activeIdentity, mustChangePassword: true },
    });

    const result = await useCase.execute(credentials, { ip: '127.0.0.1' });

    expect(result.state).toBe('password_change_required');
    expect(result.session.permissions).toEqual([]);
    expect(result.session.user.name).toBe('Ana Exemplo');
    expect(result.session.organization.name).toBe('Clinica A');
  });

  it('cadastro ilegivel depois do login aceito e erro interno, nao credencial', async () => {
    const { useCase } = build({ session: null });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).rejects.not.toBeInstanceOf(DomainException);
  });

  it('emite sessao normal com prazo absoluto e inatividade de configuracao', async () => {
    const { useCase, transactions, limiter } = build();

    const result = await useCase.execute(credentials, {
      ip: '127.0.0.1',
      requestId: 'req-1',
    });

    expect(result).toMatchObject({
      state: 'authenticated',
      accessToken: 'token',
      tokenType: 'Bearer',
      idleTimeoutSeconds: 1800,
    });

    const lifetimeMs = result.expiresAt.getTime() - Date.now();

    expect(lifetimeMs).toBeGreaterThan(43200 * 1000 - 5000);
    expect(lifetimeMs).toBeLessThanOrEqual(43200 * 1000);

    expect(transactions.createLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        tokenHash: 'hash-token',
        type: 'normal',
        requestId: 'req-1',
      }),
    );
    expect(limiter.clearLoginFailures).toHaveBeenCalledWith(
      'clinica-a',
      'user@example.test',
    );
    expect(transactions.recordLoginFailure).not.toHaveBeenCalled();
  });

  it('emite sessao restrita de dez minutos quando a troca e obrigatoria', async () => {
    const { useCase, transactions } = build({
      identity: { ...activeIdentity, mustChangePassword: true },
    });

    const result = await useCase.execute(credentials, { ip: '127.0.0.1' });

    expect(result.state).toBe('password_change_required');
    expect(result.idleTimeoutSeconds).toBeUndefined();
    expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      600 * 1000,
    );
    expect(transactions.createLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'password_change' }),
    );
  });

  it('normaliza organizacao e e-mail sem tocar na senha', async () => {
    const { useCase, identities, passwords } = build();

    await useCase.execute(
      {
        ...credentials,
        organizationCode: 'Clinica-A',
        email: 'USER@Example.Test',
      },
      { ip: '127.0.0.1' },
    );

    expect(identities.findForAuthentication).toHaveBeenCalledWith(
      'clinica-a',
      'user@example.test',
    );
    expect(passwords.verify).toHaveBeenCalledWith('hash', 'senha válida');
  });

  it.each([
    [
      'organizacao inexistente',
      { identity: null, organizationId: null as string | null },
    ],
    ['conta inexistente', { identity: null }],
    [
      'organizacao inativa',
      {
        identity: {
          ...activeIdentity,
          organizationStatus: 'inactive' as const,
        },
      },
    ],
    [
      'organizacao excluida',
      { identity: { ...activeIdentity, organizationDeletedAt: new Date() } },
    ],
    [
      'conta pendente sem troca obrigatoria',
      { identity: { ...activeIdentity, status: 'pending' as const } },
    ],
    [
      'convite vencido',
      {
        identity: {
          ...activeIdentity,
          status: 'pending' as const,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(Date.now() - 1000),
        },
      },
    ],
    [
      'conta inativa',
      { identity: { ...activeIdentity, status: 'inactive' as const } },
    ],
    [
      'conta excluida',
      { identity: { ...activeIdentity, deletedAt: new Date() } },
    ],
    [
      'conta sem hash de senha',
      { identity: { ...activeIdentity, passwordHash: null } },
    ],
    ['senha errada', { passwordMatches: false }],
  ])('esconde %s sob o mesmo erro de credenciais', async (_case, doubles) => {
    await expectInvalidCredentials(doubles);
  });

  it('recusa senha temporaria vencida como credencial invalida, sem verifica-la', async () => {
    const expired = {
      ...activeIdentity,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(Date.now() - 1000),
    };

    await expectInvalidCredentials({ identity: expired });

    const { useCase, passwords } = build({ identity: expired });

    await useCase.execute(credentials, { ip: '127.0.0.1' }).catch(() => null);

    expect(passwords.verify).not.toHaveBeenCalled();
    expect(passwords.verifyDummy).toHaveBeenCalledWith('senha válida');
  });

  it('aceita senha temporaria dentro do prazo com sessao restrita', async () => {
    const { useCase } = build({
      identity: {
        ...activeIdentity,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).resolves.toMatchObject({ state: 'password_change_required' });
  });

  it('aceita convidado pendente dentro do prazo so com sessao de troca de senha', async () => {
    const { useCase, transactions } = build({
      identity: {
        ...activeIdentity,
        status: 'pending',
        mustChangePassword: true,
        temporaryPasswordExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).resolves.toMatchObject({ state: 'password_change_required' });
    expect(transactions.createLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'password_change' }),
    );
  });

  it('recusa como credencial invalida quando a senha ou a conta mudam durante o login', async () => {
    const { useCase, transactions } = build({
      createLoginSession: jest.fn().mockResolvedValue(false),
    });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
    expect(transactions.createLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'hash' }),
    );
  });

  it('audita a tentativa falha na conta quando a conta existe', async () => {
    const { useCase, transactions } = build({ passwordMatches: false });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1', requestId: 'req-2' }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_INVALID_CREDENTIALS',
    });

    expect(transactions.recordLoginFailure).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      requestId: 'req-2',
    });
  });

  it('audita a tentativa falha sem autor quando so a organizacao existe', async () => {
    const { useCase, transactions } = build({ identity: null });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_INVALID_CREDENTIALS',
    });

    expect(transactions.recordLoginFailure).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: null,
      requestId: null,
    });
  });

  it('nao audita quando nem a organizacao do codigo existe', async () => {
    const { useCase, transactions } = build({
      identity: null,
      organizationId: null,
    });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_INVALID_CREDENTIALS',
    });

    expect(transactions.recordLoginFailure).not.toHaveBeenCalled();
  });

  it('gasta uma verificacao mesmo sem hash real, para a falha nao ser mais rapida', async () => {
    const { useCase, passwords } = build({ identity: null });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_INVALID_CREDENTIALS',
    });

    expect(passwords.verifyDummy).toHaveBeenCalledWith('senha válida');
    expect(passwords.verify).not.toHaveBeenCalled();
  });

  it('nao consulta identidade quando o limite de tentativas ja bloqueou', async () => {
    const blocked = jest.fn().mockRejectedValue(
      new DomainException({
        code: 'AUTH_TEMPORARILY_BLOCKED',
        status: 429,
        message: 'Muitas tentativas.',
        detail: 'Limite temporário de tentativas atingido.',
      }),
    );

    const { useCase, identities, transactions } = build({
      assertLoginAllowed: blocked,
    });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_TEMPORARILY_BLOCKED',
    });

    expect(identities.findForAuthentication).not.toHaveBeenCalled();
    expect(transactions.recordLoginFailure).not.toHaveBeenCalled();
  });

  it('propaga indisponibilidade do Redis sem emitir sessao', async () => {
    const unavailable = jest.fn().mockRejectedValue(
      new DomainException({
        code: 'AUTH_DEPENDENCY_UNAVAILABLE',
        status: 503,
        message: 'Serviço temporariamente indisponível.',
        detail: 'Redis indisponível para proteção contra abuso.',
      }),
    );

    const { useCase, transactions } = build({
      assertLoginAllowed: unavailable,
    });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_DEPENDENCY_UNAVAILABLE',
    });

    expect(transactions.createLoginSession).not.toHaveBeenCalled();
  });

  it('nao devolve token quando a gravacao da sessao falha', async () => {
    const failing = jest
      .fn()
      .mockRejectedValue(new Error('transacao abortada'));
    const { useCase } = build({ createLoginSession: failing });

    await expect(
      useCase.execute(credentials, { ip: '127.0.0.1' }),
    ).rejects.toThrow('transacao abortada');
  });
});
