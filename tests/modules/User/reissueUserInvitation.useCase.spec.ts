import { ReissueUserInvitationUseCase } from '@/modules/User/ReissueUserInvitation/reissueUserInvitation.useCase';
import { InvitationIssuer } from '@/modules/User/services/invitationIssuer.service';
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
  deliveryMock,
  mailContext,
} from './user.fixtures';

const setup = (
  outcome: ReissueInvitationOutcome,
  options: { smtp?: boolean; status?: 'sent' | 'failed' } = {},
) => {
  const users = { reissueInvitation: jest.fn().mockResolvedValue(outcome) };
  const passwords = { hash: jest.fn().mockResolvedValue('hash-novo') };
  const config = { getOrThrow: jest.fn().mockReturnValue(86400) };
  const delivery = deliveryMock(options);
  const useCase = new ReissueUserInvitationUseCase(
    users as never,
    new InvitationIssuer(
      delivery as never,
      passwords as never,
      config as never,
    ),
  );

  return { users, passwords, delivery, useCase };
};

describe('ReissueUserInvitationUseCase', () => {
  it('com SMTP desligado, emite nova senha provisoria e novo prazo', async () => {
    const { users, passwords, useCase } = setup({
      kind: 'reissued',
      mail: null,
    });

    const { data } = await useCase.execute(TARGET_ID, undefined, adminCtx);

    const [[command]] = users.reissueInvitation.mock.calls as [
      [ReissueInvitationCommand],
    ];
    expect(command).toMatchObject({
      organizationId: ORGANIZATION_ID,
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      invitation: { channel: 'temporary_password', passwordHash: 'hash-novo' },
    });
    expect(passwords.hash).toHaveBeenCalledWith(data.temporaryPassword);
    expect(data.channel).toBe('temporary_password');
    expect(data.expiresAt).toBe(command.invitation.expiresAt.toISOString());
  });

  it('com SMTP ligado, reemite o link e envia, sem senha na resposta', async () => {
    const { users, delivery, useCase } = setup(
      { kind: 'reissued', mail: mailContext() },
      { smtp: true },
    );

    const { data, extras } = await useCase.execute(
      TARGET_ID,
      undefined,
      adminCtx,
    );

    const [[command]] = users.reissueInvitation.mock.calls as [
      [ReissueInvitationCommand],
    ];
    expect(command.invitation.channel).toBe('email');
    expect(delivery.deliver).toHaveBeenCalledTimes(1);
    expect(data).toEqual({
      channel: 'email',
      expiresAt: command.invitation.expiresAt.toISOString(),
      delivery: { status: 'sent' },
    });
    expect(extras.message).toMatch(/^Convite enviado/);
  });

  it('troca o canal quando o admin pede a senha provisoria com SMTP ligado', async () => {
    const { users, useCase } = setup(
      { kind: 'reissued', mail: null },
      { smtp: true },
    );

    const { data } = await useCase.execute(
      TARGET_ID,
      'temporary_password',
      adminCtx,
    );

    expect(
      (users.reissueInvitation.mock.calls as [[ReissueInvitationCommand]])[0][0]
        .invitation.channel,
    ).toBe('temporary_password');
    expect(data.temporaryPassword).toHaveLength(20);
  });

  it('canal email com SMTP desligado responde 422 antes de qualquer escrita', async () => {
    const { users, useCase } = setup({ kind: 'reissued', mail: null });

    const error = await captureError(
      useCase.execute(TARGET_ID, 'email', adminCtx),
    );

    expect(error).toMatchObject({
      code: 'USER_INVITATION_EMAIL_UNAVAILABLE',
      status: 422,
    });
    expect(users.reissueInvitation).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 'USER_NOT_FOUND', 404],
    ['already_accepted', 'USER_INVITATION_ALREADY_ACCEPTED', 409],
    ['inactive', 'USER_INACTIVE', 409],
    ['actor_forbidden', 'AUTH_FORBIDDEN', 403],
  ] as const)('traduz %s em %s sem enviar nada', async (kind, code, status) => {
    const { delivery, useCase } = setup({ kind }, { smtp: true });

    const error = await captureError(
      useCase.execute(TARGET_ID, undefined, adminCtx),
    );

    expect(error).toMatchObject({ code, status });
    expect(delivery.deliver).not.toHaveBeenCalled();
  });
});
