import { ReissueUserInvitationUseCase } from '@/modules/User/ReissueUserInvitation/reissueUserInvitation.useCase';
import type {
  ReissueInvitationCommand,
  ReissueInvitationOutcome,
} from '@/modules/User/types/user.types';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  TARGET_ID,
  adminCtx,
  captureError,
} from './user.fixtures';

const setup = (outcome: ReissueInvitationOutcome) => {
  const users = { reissueInvitation: jest.fn().mockResolvedValue(outcome) };
  const passwords = { hash: jest.fn().mockResolvedValue('hash-novo') };
  const config = { getOrThrow: jest.fn().mockReturnValue(86400) };
  const useCase = new ReissueUserInvitationUseCase(
    users as never,
    passwords as never,
    config as never,
  );

  return { users, passwords, useCase };
};

describe('ReissueUserInvitationUseCase', () => {
  it('emite nova senha provisoria e novo prazo para o pendente', async () => {
    const { users, passwords, useCase } = setup({ kind: 'reissued' });

    const result = await useCase.execute(TARGET_ID, adminCtx);

    const [[command]] = users.reissueInvitation.mock.calls as [
      [ReissueInvitationCommand],
    ];
    expect(command).toMatchObject({
      organizationId: ORGANIZATION_ID,
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      passwordHash: 'hash-novo',
    });
    expect(passwords.hash).toHaveBeenCalledWith(result.temporaryPassword);
    expect(result.expiresAt).toBe(command.expiresAt.toISOString());
  });

  it.each([
    ['not_found', 'USER_NOT_FOUND', 404],
    ['already_accepted', 'USER_INVITATION_ALREADY_ACCEPTED', 409],
    ['inactive', 'USER_INACTIVE', 409],
    ['actor_forbidden', 'AUTH_FORBIDDEN', 403],
  ] as const)('traduz %s em %s', async (kind, code, status) => {
    const { useCase } = setup({ kind });

    const error = await captureError(useCase.execute(TARGET_ID, adminCtx));

    expect(error).toMatchObject({ code, status });
  });
});
