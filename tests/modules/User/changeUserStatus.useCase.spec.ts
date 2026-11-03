import { DeactivateUserUseCase } from '@/modules/User/DeactivateUser/deactivateUser.useCase';
import { ReactivateUserUseCase } from '@/modules/User/ReactivateUser/reactivateUser.useCase';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  TARGET_ID,
  adminCtx,
  captureError,
  userRow,
} from './user.fixtures';

describe('DeactivateUserUseCase', () => {
  const setup = (outcome: unknown) => {
    const users = { deactivate: jest.fn().mockResolvedValue(outcome) };

    return { users, useCase: new DeactivateUserUseCase(users as never) };
  };

  it('inativa o alvo do tenant da sessao', async () => {
    const { users, useCase } = setup({
      kind: 'deactivated',
      user: userRow({ status: 'inactive', deletedAt: new Date() }),
    });

    const result = await useCase.execute(TARGET_ID, adminCtx);

    expect(users.deactivate).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      actorUserId: ACTOR_ID,
      requestId: 'req-usuarios',
      targetUserId: TARGET_ID,
    });
    expect(result.status).toBe('inactive');
  });

  it('recusa a propria conta, mesmo em maiusculas, antes do banco', async () => {
    const { users, useCase } = setup(undefined);

    const error = await captureError(
      useCase.execute(ACTOR_ID.toUpperCase(), adminCtx),
    );

    expect(error).toMatchObject({
      code: 'USER_SELF_STATUS_CHANGE',
      status: 409,
    });
    expect(users.deactivate).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 'USER_NOT_FOUND', 404],
    ['already_inactive', 'USER_ALREADY_INACTIVE', 409],
    ['actor_forbidden', 'AUTH_FORBIDDEN', 403],
  ])('traduz %s em %s', async (kind, code, status) => {
    const { useCase } = setup({ kind });

    const error = await captureError(useCase.execute(TARGET_ID, adminCtx));

    expect(error).toMatchObject({ code, status });
  });
});

describe('ReactivateUserUseCase', () => {
  const setup = (outcome: unknown) => {
    const users = { reactivate: jest.fn().mockResolvedValue(outcome) };

    return { users, useCase: new ReactivateUserUseCase(users as never) };
  };

  it('reativa o alvo do tenant da sessao', async () => {
    const { useCase } = setup({ kind: 'reactivated', user: userRow() });

    await expect(useCase.execute(TARGET_ID, adminCtx)).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('recusa a propria conta antes do banco', async () => {
    const { users, useCase } = setup(undefined);

    const error = await captureError(useCase.execute(ACTOR_ID, adminCtx));

    expect(error).toMatchObject({
      code: 'USER_SELF_STATUS_CHANGE',
      status: 409,
    });
    expect(users.reactivate).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 'USER_NOT_FOUND', 404],
    ['already_active', 'USER_ALREADY_ACTIVE', 409],
    ['limit_reached', 'USER_PLAN_LIMIT_REACHED', 409],
    ['actor_forbidden', 'AUTH_FORBIDDEN', 403],
  ])('traduz %s em %s', async (kind, code, status) => {
    const { useCase } = setup({ kind });

    const error = await captureError(useCase.execute(TARGET_ID, adminCtx));

    expect(error).toMatchObject({ code, status });
  });
});
