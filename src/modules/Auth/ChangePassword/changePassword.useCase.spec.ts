import { DomainException } from '@/common/errors/domain.exception';

import { ChangePasswordUseCase } from './changePassword.useCase';

const context = {
  userId: 'user-1',
  organizationId: 'org-1',
  requestId: 'req-1',
} as never;

const input = {
  currentPassword: 'senha atual',
  newPassword: 'senha nova válida',
};

const build = (options: {
  currentHash?: string | null;
  currentMatches?: boolean;
  newMatches?: boolean;
  changed?: boolean;
}) => {
  const identities = {
    findPasswordHash: jest
      .fn()
      .mockResolvedValue(
        options.currentHash === undefined ? 'hash-atual' : options.currentHash,
      ),
  };

  const passwords = {
    verify: jest
      .fn()
      .mockResolvedValueOnce(options.currentMatches ?? true)
      .mockResolvedValueOnce(options.newMatches ?? false),
    hash: jest.fn().mockResolvedValue('hash-novo'),
  };

  const transactions = {
    changePassword: jest.fn().mockResolvedValue(options.changed ?? true),
  };

  const useCase = new ChangePasswordUseCase(
    identities as never,
    passwords as never,
    transactions as never,
  );

  return { useCase, identities, passwords, transactions };
};

describe('ChangePasswordUseCase', () => {
  it('altera a senha e revoga todas as sessões do usuário', async () => {
    const { useCase, transactions } = build({});

    await expect(useCase.execute(input, context)).resolves.toBeNull();

    expect(transactions.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        passwordHash: 'hash-novo',
        action: 'auth.password_changed',
      }),
    );
  });

  it('usa o usuário da sessão, não um identificador do corpo', async () => {
    const { useCase, identities } = build({});

    await useCase.execute(input, context);

    expect(identities.findPasswordHash).toHaveBeenCalledWith('user-1', 'org-1');
  });

  it('recusa senha atual incorreta sem gravar nada', async () => {
    const { useCase, transactions } = build({ currentMatches: false });

    await expect(useCase.execute(input, context)).rejects.toMatchObject<
      Partial<DomainException>
    >({
      code: 'AUTH_CURRENT_PASSWORD_INVALID',
    });

    expect(transactions.changePassword).not.toHaveBeenCalled();
  });

  it('recusa conta sem hash gravado', async () => {
    const { useCase } = build({ currentHash: null });

    await expect(useCase.execute(input, context)).rejects.toMatchObject<
      Partial<DomainException>
    >({
      code: 'AUTH_CURRENT_PASSWORD_INVALID',
    });
  });

  it('recusa repetir a senha vigente', async () => {
    const { useCase, transactions } = build({ newMatches: true });

    await expect(useCase.execute(input, context)).rejects.toMatchObject<
      Partial<DomainException>
    >({
      code: 'AUTH_PASSWORD_REUSE',
    });

    expect(transactions.changePassword).not.toHaveBeenCalled();
  });

  it('recusa quando a conta deixou de estar ativa durante a operação', async () => {
    const { useCase } = build({ changed: false });

    await expect(useCase.execute(input, context)).rejects.toMatchObject<
      Partial<DomainException>
    >({
      code: 'AUTH_UNAUTHENTICATED',
    });
  });
});
