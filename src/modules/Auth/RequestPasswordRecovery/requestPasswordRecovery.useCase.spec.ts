import { RequestPasswordRecoveryUseCase } from './requestPasswordRecovery.useCase';

describe('RequestPasswordRecoveryUseCase', () => {
  it('retorna resultado genérico quando a conta não existe', async () => {
    const useCase = new RequestPasswordRecoveryUseCase(
      {
        assertRecoveryAllowed: jest.fn().mockResolvedValue(undefined),
      } as never,
      { findForLogin: jest.fn().mockResolvedValue(null) } as never,
      { enabled: true, send: jest.fn() },
      { issue: jest.fn() } as never,
      { create: jest.fn() } as never,
      { getOrThrow: jest.fn() } as never,
    );
    await expect(
      useCase.execute(
        { organizationCode: 'clinica-a', email: 'desconhecido@example.test' },
        { ip: '127.0.0.1' },
      ),
    ).resolves.toBeNull();
  });
});
