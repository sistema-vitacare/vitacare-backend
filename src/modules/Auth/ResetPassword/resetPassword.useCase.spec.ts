import { ResetPasswordUseCase } from './resetPassword.useCase';

describe('ResetPasswordUseCase', () => {
  it('consome token válido uma única vez ao redefinir senha', async () => {
    const resets = { consumeAndReset: jest.fn().mockResolvedValue(true) };
    const useCase = new ResetPasswordUseCase(
      { hash: jest.fn().mockResolvedValue('hash-novo') } as never,
      { hash: jest.fn().mockReturnValue('hash-token') } as never,
      resets as never,
    );
    await expect(
      useCase.execute({
        token: 'token-opaco',
        newPassword: 'senha nova válida',
      }),
    ).resolves.toBeNull();
    expect(resets.consumeAndReset).toHaveBeenCalledWith(
      'hash-token',
      'hash-novo',
    );
  });
});
