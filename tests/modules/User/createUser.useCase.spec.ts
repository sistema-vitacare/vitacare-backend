import { plainToInstance } from 'class-transformer';
import { ProfileCode } from '@/common/context/requestContext.type';
import { validate } from 'class-validator';

import { CreateUserDto } from '@/modules/User/CreateUser/createUser.dto';
import { CreateUserUseCase } from '@/modules/User/CreateUser/createUser.useCase';
import type {
  CreateUserCommand,
  CreateUserOutcome,
} from '@/modules/User/types/user.types';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  adminCtx,
  captureError,
  userRow,
} from './user.fixtures';

const input: CreateUserDto = {
  name: 'Ana Exemplo',
  email: 'ana@example.test',
  cpf: '52998224725',
  profileCode: ProfileCode.CAREGIVER,
};

const setup = (outcome: CreateUserOutcome) => {
  const users = { create: jest.fn().mockResolvedValue(outcome) };
  const passwords = { hash: jest.fn().mockResolvedValue('hash-provisorio') };
  const config = { getOrThrow: jest.fn().mockReturnValue(86400) };
  const useCase = new CreateUserUseCase(
    users as never,
    passwords as never,
    config as never,
  );

  return { users, passwords, config, useCase };
};

describe('CreateUserDto', () => {
  const errorsOf = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(CreateUserDto, body))).map(
      (error) => error.property,
    );

  it('normaliza e-mail e CPF antes de validar', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...input,
      email: '  Ana@Example.TEST ',
      cpf: '529.982.247-25',
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto.email).toBe('ana@example.test');
    expect(dto.cpf).toBe('52998224725');
  });

  it('recusa CPF com digito verificador invalido', async () => {
    expect(await errorsOf({ ...input, cpf: '52998224724' })).toEqual(['cpf']);
  });

  it('recusa perfil fora dos quatro do tenant', async () => {
    expect(await errorsOf({ ...input, profileCode: 'platform_admin' })).toEqual(
      ['profileCode'],
    );
  });

  it('exige nome, e-mail, CPF e perfil', async () => {
    expect((await errorsOf({})).sort()).toEqual(
      ['cpf', 'email', 'name', 'profileCode'].sort(),
    );
  });
});

describe('CreateUserUseCase', () => {
  it('cadastra pendente com senha provisoria de 24 h devolvida uma unica vez', async () => {
    const created = userRow({ status: 'pending' });
    const { users, passwords, useCase } = setup({
      kind: 'created',
      user: created,
    });
    const before = Date.now();

    const result = await useCase.execute(input, adminCtx);

    const [[command]] = users.create.mock.calls as [[CreateUserCommand]];
    expect(command).toMatchObject({
      organizationId: ORGANIZATION_ID,
      actorUserId: ACTOR_ID,
      requestId: 'req-usuarios',
      name: 'Ana Exemplo',
      email: 'ana@example.test',
      cpf: '52998224725',
      phone: null,
      profileCode: 'caregiver',
      passwordHash: 'hash-provisorio',
    });
    expect(passwords.hash).toHaveBeenCalledWith(result.temporaryPassword);
    expect(result.temporaryPassword).toHaveLength(20);
    expect(command.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 86400 * 1000,
    );
    expect(result.expiresAt).toBe(command.expiresAt.toISOString());
    expect(result.user).toMatchObject({ id: created.id, cpf: '52998224725' });
  });

  it('responde 409 com mensagem orientativa no limite do plano', async () => {
    const { useCase } = setup({ kind: 'limit_reached' });

    const error = await captureError(useCase.execute(input, adminCtx));

    expect(error).toMatchObject({
      code: 'USER_PLAN_LIMIT_REACHED',
      status: 409,
    });
  });

  it('responde 403 quando o ator deixou de ser admin ativo', async () => {
    const { useCase } = setup({ kind: 'actor_forbidden' });

    const error = await captureError(useCase.execute(input, adminCtx));

    expect(error).toMatchObject({ code: 'AUTH_FORBIDDEN', status: 403 });
  });
});
