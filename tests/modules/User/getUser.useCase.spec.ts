import { GetUserUseCase } from '@/modules/User/GetUser/getUser.useCase';

import {
  ORGANIZATION_ID,
  TARGET_ID,
  adminCtx,
  captureError,
  userRow,
} from './user.fixtures';

describe('GetUserUseCase', () => {
  it('devolve o usuario do tenant com CPF inteiro', async () => {
    const repository = { findById: jest.fn().mockResolvedValue(userRow()) };
    const useCase = new GetUserUseCase(repository as never);

    const result = await useCase.execute(TARGET_ID, adminCtx);

    expect(repository.findById).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      TARGET_ID,
    );
    expect(result.cpf).toBe('52998224725');
  });

  it('responde 404 quando o usuario nao existe no tenant', async () => {
    const repository = { findById: jest.fn().mockResolvedValue(null) };
    const useCase = new GetUserUseCase(repository as never);

    const error = await captureError(useCase.execute(TARGET_ID, adminCtx));

    expect(error).toMatchObject({ code: 'USER_NOT_FOUND', status: 404 });
  });
});
