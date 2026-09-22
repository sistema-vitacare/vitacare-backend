import { DomainException } from '@/common/errors/domain.exception';
import { LoginUseCase } from './login.useCase';

describe('LoginUseCase', () => {
  const identity = {
    userId: 'user-1',
    organizationId: 'org-1',
    passwordHash: 'hash',
    mustChangePassword: false,
    status: 'active' as const,
    deletedAt: null,
    organizationStatus: 'active' as const,
    organizationDeletedAt: null,
    profile: 'admin' as never,
    permissions: new Set<string>(),
  };

  it('emite sessao normal somente para credencial valida', async () => {
    const identities = { findForLogin: jest.fn().mockResolvedValue(identity) };
    const transactions = {
      createLoginSession: jest.fn().mockResolvedValue(undefined),
    };
    const limiter = {
      assertLoginAllowed: jest.fn().mockResolvedValue(undefined),
      clearLoginFailures: jest.fn().mockResolvedValue(undefined),
      recordLoginFailure: jest.fn().mockResolvedValue(undefined),
    };
    const passwords = { verify: jest.fn().mockResolvedValue(true) };
    const tokens = {
      issue: jest.fn().mockReturnValue({ raw: 'token', hash: 'hash-token' }),
    };

    const useCase = new LoginUseCase(
      identities as never,
      transactions as never,
      limiter as never,
      passwords as never,
      tokens as never,
    );

    await expect(
      useCase.execute(
        {
          organizationCode: 'clinica-a',
          email: 'user@example.test',
          password: 'senha válida',
        },
        { ip: '127.0.0.1' },
      ),
    ).resolves.toMatchObject({
      state: 'authenticated',
      accessToken: 'token',
      tokenType: 'Bearer',
      idleTimeoutSeconds: 1800,
    });
    expect(transactions.createLoginSession).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        tokenHash: 'hash-token',
        type: 'normal',
      }),
    );
    expect(limiter.clearLoginFailures).toHaveBeenCalledWith(
      'clinica-a',
      'user@example.test',
    );
  });

  it('oculta identidade invalida sob o mesmo erro de credenciais', async () => {
    const limiter = {
      assertLoginAllowed: jest.fn().mockResolvedValue(undefined),
      clearLoginFailures: jest.fn(),
      recordLoginFailure: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new LoginUseCase(
      { findForLogin: jest.fn().mockResolvedValue(null) } as never,
      { createLoginSession: jest.fn() } as never,
      limiter as never,
      { verify: jest.fn() } as never,
      { issue: jest.fn() } as never,
    );

    await expect(
      useCase.execute(
        {
          organizationCode: 'clinica-a',
          email: 'unknown@example.test',
          password: 'senha válida',
        },
        { ip: '127.0.0.1' },
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
    expect(limiter.recordLoginFailure).toHaveBeenCalledWith(
      'clinica-a',
      'unknown@example.test',
      '127.0.0.1',
    );
  });
});
