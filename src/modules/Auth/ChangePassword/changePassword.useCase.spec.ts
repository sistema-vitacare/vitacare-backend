import { ChangePasswordUseCase } from './changePassword.useCase';

describe('ChangePasswordUseCase', () => {
  it('altera a senha e revoga todas as sessões do usuário', async () => {
    const identity = {
      findPasswordHash: jest.fn().mockResolvedValue('hash-atual'),
    };
    const passwords = {
      verify: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
      hash: jest.fn().mockResolvedValue('hash-novo'),
    };
    const transactions = { changePassword: jest.fn().mockResolvedValue(true) };
    const useCase = new ChangePasswordUseCase(
      identity as never,
      passwords,
      transactions as never,
    );
    await expect(
      useCase.execute(
        { currentPassword: 'senha atual', newPassword: 'senha nova válida' },
        { userId: 'u1', organizationId: 'o1', requestId: 'r1' } as never,
      ),
    ).resolves.toBeNull();
    expect(transactions.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        organizationId: 'o1',
        passwordHash: 'hash-novo',
      }),
    );
  });
});
