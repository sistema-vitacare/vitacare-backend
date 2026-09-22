import { DomainException } from '@/common/errors/domain.exception';

import { RequestPasswordRecoveryUseCase } from '@/modules/Auth/RequestPasswordRecovery/requestPasswordRecovery.useCase';
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

const settings: Record<string, string | number> = {
  'auth.recoverySeconds': 900,
  'mail.passwordResetUrl': 'https://app.example.test/redefinir-senha',
};

const build = (options: {
  identity?: LoginIdentity | null;
  mailerEnabled?: boolean;
  send?: jest.Mock;
  assertRecoveryAllowed?: jest.Mock;
}) => {
  const limiter = {
    assertRecoveryAllowed:
      options.assertRecoveryAllowed ?? jest.fn().mockResolvedValue(undefined),
  };

  const identities = {
    findForLogin: jest
      .fn()
      .mockResolvedValue(
        options.identity === undefined ? activeIdentity : options.identity,
      ),
  };

  const mailer = {
    enabled: options.mailerEnabled ?? true,
    send: options.send ?? jest.fn().mockResolvedValue(undefined),
  };

  const tokens = {
    issue: jest.fn().mockReturnValue({ raw: 'token-cru', hash: 'hash-token' }),
  };

  const resets = {
    create: jest.fn().mockResolvedValue(undefined),
    revoke: jest.fn().mockResolvedValue(undefined),
  };

  const config = { getOrThrow: jest.fn((key: string) => settings[key]) };

  const useCase = new RequestPasswordRecoveryUseCase(
    limiter as never,
    identities as never,
    mailer,
    tokens as never,
    resets as never,
    config as never,
  );

  return { useCase, limiter, identities, mailer, tokens, resets };
};

const request = {
  organizationCode: 'clinica-a',
  email: 'user@example.test',
};

describe('RequestPasswordRecoveryUseCase', () => {
  it('emite token com prazo de configuração e envia o link', async () => {
    const { useCase, resets, mailer } = build({});

    await expect(
      useCase.execute(request, { ip: '127.0.0.1' }),
    ).resolves.toBeNull();

    const [organizationId, userId, tokenHash, expiresAt] = resets.create.mock
      .calls[0] as [string, string, string, Date];

    expect({ organizationId, userId, tokenHash }).toEqual({
      organizationId: 'org-1',
      userId: 'user-1',
      tokenHash: 'hash-token',
    });
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(900 * 1000);

    expect(mailer.send).toHaveBeenCalledWith({
      to: 'user@example.test',
      resetUrl: 'https://app.example.test/redefinir-senha?token=token-cru',
      expiresInMinutes: 15,
    });
  });

  it('retorna resultado genérico quando a conta não existe', async () => {
    const { useCase, resets, mailer } = build({ identity: null });

    await expect(
      useCase.execute(request, { ip: '127.0.0.1' }),
    ).resolves.toBeNull();

    expect(resets.create).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it.each([
    ['conta inativa', { ...activeIdentity, status: 'inactive' as const }],
    ['conta excluída', { ...activeIdentity, deletedAt: new Date() }],
    [
      'organização inativa',
      { ...activeIdentity, organizationStatus: 'inactive' as const },
    ],
  ])('não emite token para %s', async (_case, identity) => {
    const { useCase, resets } = build({ identity });

    await expect(
      useCase.execute(request, { ip: '127.0.0.1' }),
    ).resolves.toBeNull();

    expect(resets.create).not.toHaveBeenCalled();
  });

  it('não cria token quando o SMTP está desabilitado', async () => {
    const { useCase, resets } = build({ mailerEnabled: false });

    await expect(
      useCase.execute(request, { ip: '127.0.0.1' }),
    ).resolves.toBeNull();

    expect(resets.create).not.toHaveBeenCalled();
  });

  it('revoga o token quando o envio falha', async () => {
    const send = jest.fn().mockRejectedValue(new Error('SMTP fora do ar'));
    const { useCase, resets } = build({ send });

    await expect(
      useCase.execute(request, { ip: '127.0.0.1' }),
    ).resolves.toBeNull();

    expect(resets.revoke).toHaveBeenCalledWith('hash-token');
  });

  it('propaga o bloqueio por abuso antes de consultar a identidade', async () => {
    const blocked = jest.fn().mockRejectedValue(
      new DomainException({
        code: 'AUTH_TEMPORARILY_BLOCKED',
        status: 429,
        message: 'Muitas solicitações.',
        detail: 'Limite temporário de solicitações atingido.',
      }),
    );

    const { useCase, identities } = build({ assertRecoveryAllowed: blocked });

    await expect(
      useCase.execute(request, { ip: '127.0.0.1' }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_TEMPORARILY_BLOCKED',
    });

    expect(identities.findForLogin).not.toHaveBeenCalled();
  });
});
