import { DomainException } from '@/common/errors/domain.exception';

import { CompleteFirstAccessUseCase } from './completeFirstAccess.useCase';

const context = {
  userId: 'user-1',
  organizationId: 'org-1',
  requestId: 'req-1',
} as never;

const build = (options: {
  currentHash?: string | null;
  reusesPassword?: boolean;
  completed?: boolean;
}) => {
  const identities = {
    findPasswordHash: jest
      .fn()
      .mockResolvedValue(
        options.currentHash === undefined
          ? 'hash-provisorio'
          : options.currentHash,
      ),
  };

  const passwords = {
    verify: jest.fn().mockResolvedValue(options.reusesPassword ?? false),
    hash: jest.fn().mockResolvedValue('hash-novo'),
  };

  const transactions = {
    completeFirstAccess: jest.fn().mockResolvedValue(options.completed ?? true),
  };

  const useCase = new CompleteFirstAccessUseCase(
    identities as never,
    passwords as never,
    transactions as never,
  );

  return { useCase, identities, passwords, transactions };
};

describe('CompleteFirstAccessUseCase', () => {
  it('troca a senha, revoga o desafio e exige novo login', async () => {
    const { useCase, transactions } = build({});

    await expect(
      useCase.execute(
        { newPassword: 'nova senha válida', sessionId: 'session-1' },
        context,
      ),
    ).resolves.toBeNull();

    expect(transactions.completeFirstAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        userId: 'user-1',
        organizationId: 'org-1',
        passwordHash: 'hash-novo',
      }),
    );
  });

  it('recusa repetir a senha provisória', async () => {
    const { useCase, transactions } = build({ reusesPassword: true });

    await expect(
      useCase.execute(
        { newPassword: 'senha provisória', sessionId: 'session-1' },
        context,
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_PASSWORD_REUSE',
    });

    expect(transactions.completeFirstAccess).not.toHaveBeenCalled();
  });

  it('recusa desafio já consumido, revogado ou de outra sessão', async () => {
    const { useCase } = build({ completed: false });

    await expect(
      useCase.execute(
        { newPassword: 'nova senha válida', sessionId: 'session-1' },
        context,
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_UNAUTHENTICATED',
    });
  });

  it('segue quando a conta ainda não tem hash gravado', async () => {
    const { useCase, passwords, transactions } = build({ currentHash: null });

    await expect(
      useCase.execute(
        { newPassword: 'nova senha válida', sessionId: 'session-1' },
        context,
      ),
    ).resolves.toBeNull();

    expect(passwords.verify).not.toHaveBeenCalled();
    expect(transactions.completeFirstAccess).toHaveBeenCalled();
  });

  it('preserva senha com espaços e acentos sem normalizar', async () => {
    const { useCase, passwords } = build({});

    await useCase.execute(
      { newPassword: '  Ação  Válida  ', sessionId: 'session-1' },
      context,
    );

    expect(passwords.hash).toHaveBeenCalledWith('  Ação  Válida  ');
  });
});
