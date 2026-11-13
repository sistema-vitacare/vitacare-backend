import { DomainException } from '@/common/errors/domain.exception';
import { AcceptInvitationDto } from '@/modules/Auth/AcceptInvitation/acceptInvitation.dto';
import { AcceptInvitationUseCase } from '@/modules/Auth/AcceptInvitation/acceptInvitation.useCase';
import { InspectInvitationUseCase } from '@/modules/Auth/InspectInvitation/inspectInvitation.useCase';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const INVALID = {
  code: 'AUTH_INVITATION_INVALID_OR_EXPIRED',
  status: 422,
  message:
    'Este convite não é mais válido. Peça um novo convite ao administrador da sua organização.',
  fields: null,
};

const build = (repository: { inspect?: jest.Mock; accept?: jest.Mock }) => {
  const limiter = {
    assertInvitationAllowed: jest.fn().mockResolvedValue(undefined),
  };
  const tokens = { hash: jest.fn().mockReturnValue('hash-do-token') };
  const passwords = { hash: jest.fn().mockResolvedValue('hash-da-senha') };

  return {
    limiter,
    inspect: new InspectInvitationUseCase(
      limiter as never,
      tokens as never,
      repository as never,
    ),
    accept: new AcceptInvitationUseCase(
      limiter as never,
      tokens as never,
      passwords as never,
      repository as never,
    ),
  };
};

describe('InspectInvitationUseCase', () => {
  it('le o convite pelo hash e devolve usuario, organizacao, perfil e validade', async () => {
    const inspect = jest.fn().mockResolvedValue({
      userName: 'Ana Exemplo',
      email: 'ana@example.test',
      organizationCode: 'clinica-exemplo',
      organizationName: 'Clinica Exemplo',
      profileCode: 'caregiver',
      profileName: 'Cuidador',
      expiresAt: new Date('2026-11-16T15:00:00.000Z'),
    });
    const { inspect: useCase, limiter } = build({ inspect });

    await expect(
      useCase.execute({ token: 'token-cru' }, { ip: '10.0.0.1' }),
    ).resolves.toEqual({
      user: { name: 'Ana Exemplo', email: 'ana@example.test' },
      organization: { code: 'clinica-exemplo', name: 'Clinica Exemplo' },
      profile: { code: 'caregiver', name: 'Cuidador' },
      expiresAt: '2026-11-16T15:00:00.000Z',
    });
    expect(inspect).toHaveBeenCalledWith('hash-do-token');
    expect(limiter.assertInvitationAllowed).toHaveBeenCalledWith('10.0.0.1');
  });

  it('responde o mesmo 422 para inexistente, vencido, consumido ou revogado', async () => {
    const { inspect } = build({ inspect: jest.fn().mockResolvedValue(null) });

    await expect(
      inspect.execute({ token: 'qualquer' }, { ip: '10.0.0.1' }),
    ).rejects.toMatchObject<Partial<DomainException>>(INVALID);
  });

  it('o limite por IP barra antes de consultar', async () => {
    const repository = { inspect: jest.fn() };
    const { inspect, limiter } = build(repository);
    limiter.assertInvitationAllowed.mockRejectedValue(
      new DomainException({
        code: 'AUTH_TEMPORARILY_BLOCKED',
        status: 429,
        message: 'bloqueado',
      }),
    );

    await expect(
      inspect.execute({ token: 'x' }, { ip: '10.0.0.1' }),
    ).rejects.toMatchObject({ code: 'AUTH_TEMPORARILY_BLOCKED' });
    expect(repository.inspect).not.toHaveBeenCalled();
  });
});

describe('AcceptInvitationUseCase', () => {
  it('aceita pelo hash, grava o hash da senha e orienta o login', async () => {
    const accept = jest.fn().mockResolvedValue({
      organizationCode: 'clinica-exemplo',
      email: 'ana@example.test',
    });
    const { accept: useCase } = build({ accept });

    const result = await useCase.execute(
      { token: 'token-cru', newPassword: 'senha nova valida' },
      { ip: '10.0.0.1', requestId: 'req-aceite' },
    );

    expect(accept).toHaveBeenCalledWith(
      'hash-do-token',
      'hash-da-senha',
      'req-aceite',
    );
    expect(result.data).toEqual({
      organizationCode: 'clinica-exemplo',
      email: 'ana@example.test',
    });
    expect(result.extras.message).toBe(
      'Senha cadastrada. Entre com seu e-mail e a nova senha.',
    );
    expect(result.data).not.toHaveProperty('accessToken');
  });

  it('responde o mesmo 422 quando o repositorio recusa', async () => {
    const { accept } = build({ accept: jest.fn().mockResolvedValue(null) });

    await expect(
      accept.execute(
        { token: 'x', newPassword: 'senha nova valida' },
        { ip: '10.0.0.1', requestId: null },
      ),
    ).rejects.toMatchObject<Partial<DomainException>>(INVALID);
  });

  it('valida a senha com a politica da redefinicao (8 a 128)', async () => {
    const errors = async (body: object) =>
      (await validate(plainToInstance(AcceptInvitationDto, body))).map(
        (error) => error.property,
      );

    expect(await errors({ token: 't', newPassword: 'curta' })).toEqual([
      'newPassword',
    ]);
    expect(await errors({ token: '', newPassword: 'senha valida' })).toEqual([
      'token',
    ]);
    expect(await errors({ token: 't', newPassword: 'x'.repeat(129) })).toEqual([
      'newPassword',
    ]);
  });
});
