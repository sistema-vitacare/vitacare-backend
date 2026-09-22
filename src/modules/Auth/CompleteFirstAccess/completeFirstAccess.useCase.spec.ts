import { CompleteFirstAccessUseCase } from './completeFirstAccess.useCase';

describe('CompleteFirstAccessUseCase', () => {
  it('troca a senha, revoga o desafio e exige novo login', async () => {
    const passwords = {
      verify: jest.fn().mockResolvedValue(false),
      hash: jest.fn().mockResolvedValue('new-hash'),
    };
    const transactions = {
      completeFirstAccess: jest.fn().mockResolvedValue(true),
    };
    const useCase = new CompleteFirstAccessUseCase(
      passwords,
      transactions as never,
    );

    await expect(
      useCase.execute(
        { newPassword: 'nova senha válida', sessionId: 'session-1' },
        { userId: 'user-1', organizationId: 'org-1', requestId: 'r1' } as never,
      ),
    ).resolves.toBeNull();
    expect(transactions.completeFirstAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        userId: 'user-1',
        organizationId: 'org-1',
        passwordHash: 'new-hash',
      }),
    );
  });
});
