import { DomainException } from '@/common/errors/domain.exception';

import { ResetPasswordUseCase } from '@/modules/Auth/ResetPassword/resetPassword.useCase';

const build = (consumed: boolean) => {
  const resets = { consumeAndReset: jest.fn().mockResolvedValue(consumed) };

  const useCase = new ResetPasswordUseCase(
    { hash: jest.fn().mockResolvedValue('hash-novo') } as never,
    { hash: jest.fn().mockReturnValue('hash-token') } as never,
    resets as never,
  );

  return { useCase, resets };
};

describe('ResetPasswordUseCase', () => {
  it('consome token válido uma única vez ao redefinir senha', async () => {
    const { useCase, resets } = build(true);

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

  it('responde igual para token inexistente, expirado, consumido ou revogado', async () => {
    const { useCase } = build(false);

    await expect(
      useCase.execute({
        token: 'token-qualquer',
        newPassword: 'senha nova aqui',
      }),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_RESET_TOKEN_INVALID_OR_EXPIRED',
      fields: null,
    });
  });

  it('nunca guarda o token cru: consulta pelo hash', async () => {
    const { useCase, resets } = build(true);

    await useCase.execute({
      token: 'token-opaco',
      newPassword: 'senha nova válida',
    });

    const [hashedToken] = resets.consumeAndReset.mock.calls[0] as [string];

    expect(hashedToken).not.toBe('token-opaco');
  });
});
