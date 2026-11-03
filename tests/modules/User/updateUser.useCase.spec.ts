import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateUserDto } from '@/modules/User/UpdateUser/updateUser.dto';
import { UpdateUserUseCase } from '@/modules/User/UpdateUser/updateUser.useCase';
import type { UpdateUserOutcome } from '@/modules/User/types/user.types';

import {
  ORGANIZATION_ID,
  TARGET_ID,
  adminCtx,
  captureError,
  userRow,
} from './user.fixtures';

const setup = (outcome: UpdateUserOutcome) => {
  const users = { update: jest.fn().mockResolvedValue(outcome) };

  return { users, useCase: new UpdateUserUseCase(users as never) };
};

describe('UpdateUserDto', () => {
  it('normaliza e-mail e CPF e aceita null para limpar o telefone', async () => {
    const dto = plainToInstance(UpdateUserDto, {
      email: ' Ana@Example.TEST',
      cpf: '529.982.247-25',
      phone: null,
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto).toEqual({
      email: 'ana@example.test',
      cpf: '52998224725',
      phone: null,
    });
  });

  it('recusa nome nulo ou vazio', async () => {
    for (const name of [null, '   ']) {
      const errors = await validate(plainToInstance(UpdateUserDto, { name }));

      expect(errors.map((error) => error.property)).toEqual(['name']);
    }
  });
});

describe('UpdateUserUseCase', () => {
  it('envia so os campos informados', async () => {
    const { users, useCase } = setup({ kind: 'updated', user: userRow() });

    await useCase.execute(
      TARGET_ID,
      { name: 'Ana Nova', phone: null },
      adminCtx,
    );

    expect(users.update).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      actorUserId: adminCtx.userId,
      requestId: 'req-usuarios',
      targetUserId: TARGET_ID,
      patch: { name: 'Ana Nova', phone: null },
    });
  });

  it('responde 422 sem tocar o banco quando nenhum campo veio', async () => {
    const { users, useCase } = setup({ kind: 'not_found' });

    const error = await captureError(useCase.execute(TARGET_ID, {}, adminCtx));

    expect(error).toMatchObject({
      code: 'USER_NOTHING_TO_UPDATE',
      status: 422,
    });
    expect(users.update).not.toHaveBeenCalled();
  });

  it('responde 404 para alvo fora do tenant', async () => {
    const { useCase } = setup({ kind: 'not_found' });

    const error = await captureError(
      useCase.execute(TARGET_ID, { name: 'Ana' }, adminCtx),
    );

    expect(error).toMatchObject({ code: 'USER_NOT_FOUND', status: 404 });
  });

  it('devolve o usuario mesmo quando nada mudou', async () => {
    const { useCase } = setup({ kind: 'unchanged', user: userRow() });

    await expect(
      useCase.execute(TARGET_ID, { name: 'Usuaria Sintetica' }, adminCtx),
    ).resolves.toMatchObject({ id: TARGET_ID, cpf: '52998224725' });
  });
});
