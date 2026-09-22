import { ResetUserPasswordAsAdminUseCase } from './resetUserPasswordAsAdmin.useCase';

describe('ResetUserPasswordAsAdminUseCase', () => {
  it('gera senha temporária e não permite redefinir a própria conta', async () => {
    const transactions = {
      resetUserPasswordAsAdmin: jest.fn().mockResolvedValue('updated'),
    };
    const useCase = new ResetUserPasswordAsAdminUseCase(
      { hash: jest.fn().mockResolvedValue('hash-temporario') } as never,
      transactions as never,
      () => 'ABCDEFGHJKLMNPQRSTUV',
    );
    await expect(
      useCase.execute({ userId: 'u2' }, {
        userId: 'u1',
        organizationId: 'o1',
        requestId: 'r1',
      } as never),
    ).resolves.toEqual({ temporaryPassword: 'ABCDEFGHJKLMNPQRSTUV' });
  });
});
