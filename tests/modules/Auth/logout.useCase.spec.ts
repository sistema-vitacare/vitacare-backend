import { LogoutUseCase } from '@/modules/Auth/Logout/logout.useCase';

describe('LogoutUseCase', () => {
  it('revoga apenas a sessão apresentada', async () => {
    const sessions = { revoke: jest.fn().mockResolvedValue(undefined) };
    const useCase = new LogoutUseCase(sessions as never);
    await expect(useCase.execute('session-1')).resolves.toBeNull();
    expect(sessions.revoke).toHaveBeenCalledWith('session-1', 'logout');
  });
});
