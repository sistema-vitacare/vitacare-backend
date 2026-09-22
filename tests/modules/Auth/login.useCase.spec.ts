import { DomainException } from '@/common/errors/domain.exception';

import { LoginUseCase } from '@/modules/Auth/Login/login.useCase';
import type { LoginIdentity } from '@/modules/Auth/types/auth.types';

const activeIdentity: LoginIdentity = {
  userId: 'user-1',
  organizationId: 'org-1',
  passwordHash: 'hash',
  mustChangePassword: false,
  status: 'active',
  deletedAt: null,
  organizationStatus: 'active',
  organizationDeletedAt: null,
  profile: 'admin' as never,
  permissions: new Set<string>(),
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
  };

  const transactions = {
    createLoginSession:
      doubles.createLoginSession ?? jest.fn().mockResolvedValue(undefined),
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
  const { useCase, limiter, transactions } = build(doubles);

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
};

describe('LoginUseCase', () => {
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
      'conta ainda pendente',
      { identity: { ...activeIdentity, status: 'pending' as const } },
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
