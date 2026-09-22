import { LogoutUseCase } from '@/modules/Auth/Logout/logout.useCase';

const context = {
  requestId: 'req-1',
  userId: 'user-1',
  organizationId: 'org-1',
  profile: 'admin',
  permissions: new Set<string>(),
} as never;

describe('LogoutUseCase', () => {
  it('revoga apenas a sessão apresentada, dentro da própria organização', async () => {
    const transactions = { recordLogout: jest.fn().mockResolvedValue(true) };
    const useCase = new LogoutUseCase(transactions as never);

    await expect(useCase.execute('session-1', context)).resolves.toBeNull();

    expect(transactions.recordLogout).toHaveBeenCalledWith({
      sessionId: 'session-1',
      userId: 'user-1',
      organizationId: 'org-1',
      requestId: 'req-1',
    });
  });

  it('responde igual quando a sessão já estava revogada', async () => {
    const transactions = { recordLogout: jest.fn().mockResolvedValue(false) };
    const useCase = new LogoutUseCase(transactions as never);

    await expect(useCase.execute('session-1', context)).resolves.toBeNull();
  });
});
