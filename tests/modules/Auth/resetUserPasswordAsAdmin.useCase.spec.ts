import { DomainException } from '@/common/errors/domain.exception';

import {
  generateTemporaryPassword,
  ResetUserPasswordAsAdminUseCase,
} from '@/modules/Auth/ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';

const adminContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  requestId: 'req-1',
} as never;

const build = (result: 'updated' | 'not_found' = 'updated') => {
  const transactions = {
    resetUserPasswordAsAdmin: jest.fn().mockResolvedValue(result),
  };

  const passwords = { hash: jest.fn().mockResolvedValue('hash-temporario') };

  const useCase = new ResetUserPasswordAsAdminUseCase(
    passwords as never,
    transactions as never,
  );

  return { useCase, transactions, passwords };
};

describe('ResetUserPasswordAsAdminUseCase', () => {
  it('emite senha temporária e grava apenas o hash na organização do ator', async () => {
    const { useCase, transactions, passwords } = build();

    const result = await useCase.execute({ userId: 'user-2' }, adminContext);

    expect(result.temporaryPassword).toHaveLength(20);
    expect(passwords.hash).toHaveBeenCalledWith(result.temporaryPassword);
    expect(transactions.resetUserPasswordAsAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        targetUserId: 'user-2',
        organizationId: 'org-1',
        actorUserId: 'admin-1',
        passwordHash: 'hash-temporario',
      }),
    );
  });

  it('recusa redefinir a própria conta', async () => {
    const { useCase, transactions } = build();

    await expect(
      useCase.execute({ userId: 'admin-1' }, adminContext),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_INVALID_STATE',
    });

    expect(transactions.resetUserPasswordAsAdmin).not.toHaveBeenCalled();
  });

  it('trata alvo de outra organização como inexistente', async () => {
    const { useCase } = build('not_found');

    await expect(
      useCase.execute({ userId: 'user-de-outro-tenant' }, adminContext),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_USER_NOT_FOUND',
    });
  });

  it('gera senhas distintas sem caracteres ambíguos', () => {
    const passwords = new Set(
      Array.from({ length: 50 }, () => generateTemporaryPassword()),
    );

    expect(passwords.size).toBe(50);

    for (const password of passwords) {
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
    }
  });
});
