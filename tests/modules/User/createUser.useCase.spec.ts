import { plainToInstance } from 'class-transformer';
import { ProfileCode } from '@/common/context/requestContext.type';
import { validate } from 'class-validator';

import { CreateUserDto } from '@/modules/User/CreateUser/createUser.dto';
import { CreateUserUseCase } from '@/modules/User/CreateUser/createUser.useCase';
import type {
  CreateUserCommand,
  CreateUserOutcome,
} from '@/modules/User/types/user.types';

import { InvitationIssuer } from '@/modules/User/services/invitationIssuer.service';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  adminCtx,
  captureError,
  deliveryMock,
  mailContext,
  userRow,
} from './user.fixtures';

const input: CreateUserDto = {
  name: 'Ana Exemplo',
  email: 'ana@example.test',
  cpf: '52998224725',
  profileCode: ProfileCode.CAREGIVER,
};

const setup = (
  outcome: CreateUserOutcome,
  options: { smtp?: boolean; status?: 'sent' | 'failed' } = {},
) => {
  const users = {
    create: jest.fn().mockResolvedValue(outcome),
    findById: jest.fn().mockResolvedValue(null),
  };
  const passwords = { hash: jest.fn().mockResolvedValue('hash-provisorio') };
  const config = { getOrThrow: jest.fn().mockReturnValue(86400) };
  const delivery = deliveryMock(options);
  const useCase = new CreateUserUseCase(
    users as never,
    new InvitationIssuer(
      delivery as never,
      passwords as never,
      config as never,
    ),
  );

  return { users, passwords, config, delivery, useCase };
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

  it('aceita os dois canais e recusa outro', async () => {
    expect(await errorsOf({ ...input, channel: 'email' })).toEqual([]);
    expect(await errorsOf({ ...input, channel: 'temporary_password' })).toEqual(
      [],
    );
    expect(await errorsOf({ ...input, channel: 'sms' })).toEqual(['channel']);
  });

  it('exige nome, e-mail, CPF e perfil', async () => {
    expect((await errorsOf({})).sort()).toEqual(
      ['cpf', 'email', 'name', 'profileCode'].sort(),
    );
  });
});

describe('CreateUserUseCase', () => {
  it('com SMTP desligado, cadastra pendente com senha provisoria de 24 h devolvida uma unica vez', async () => {
    const created = userRow({ status: 'pending' });
    const { users, passwords, delivery, useCase } = setup({
      kind: 'created',
      user: created,
      mail: null,
    });
    const before = Date.now();

    const { data, extras } = await useCase.execute(input, adminCtx);

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
      invitation: {
        channel: 'temporary_password',
        passwordHash: 'hash-provisorio',
      },
    });
    expect(passwords.hash).toHaveBeenCalledWith(data.temporaryPassword);
    expect(data.temporaryPassword).toHaveLength(20);
    expect(data.channel).toBe('temporary_password');
    expect(data.delivery).toBeUndefined();
    expect(command.invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 86400 * 1000,
    );
    expect(data.expiresAt).toBe(command.invitation.expiresAt.toISOString());
    expect(data.user).toMatchObject({ id: created.id, cpf: '52998224725' });
    expect(extras).toEqual({});
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('com SMTP ligado, grava so o hash do token e envia o link depois do cadastro, sem senha na resposta', async () => {
    const created = userRow({ status: 'pending' });
    const reread = userRow({
      status: 'pending',
      invitationExpiresAt: new Date(Date.now() + 3600_000),
      invitationSentAt: new Date(),
    });
    const { users, passwords, delivery, useCase } = setup(
      { kind: 'created', user: created, mail: mailContext() },
      { smtp: true },
    );
    users.findById.mockResolvedValue(reread);

    const { data, extras } = await useCase.execute(input, adminCtx);

    const [[command]] = users.create.mock.calls as [[CreateUserCommand]];
    expect(command.invitation).toMatchObject({
      channel: 'email',
      tokenHash: 'f'.repeat(64),
    });
    expect(command.invitation).not.toHaveProperty('passwordHash');
    expect(command.invitation.expiresAt).toBeInstanceOf(Date);
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(delivery.deliver).toHaveBeenCalledWith({
      actor: {
        organizationId: ORGANIZATION_ID,
        actorUserId: ACTOR_ID,
        requestId: 'req-usuarios',
      },
      mail: mailContext(),
      rawToken: 'token-cru',
      expiresAt: command.invitation.expiresAt,
    });
    expect(data).not.toHaveProperty('temporaryPassword');
    expect(JSON.stringify(data)).not.toContain('token-cru');
    expect(data).toMatchObject({
      channel: 'email',
      delivery: { status: 'sent' },
      expiresAt: command.invitation.expiresAt.toISOString(),
    });
    expect(data.user.invitation).toMatchObject({
      channel: 'email',
      status: 'pending',
    });
    expect(extras.message).toMatch(/^Convite enviado ao e-mail do usuário/);
  });

  it('com falha de envio, responde failed com orientacao para reemitir', async () => {
    const { useCase } = setup(
      {
        kind: 'created',
        user: userRow({ status: 'pending' }),
        mail: mailContext(),
      },
      { smtp: true, status: 'failed' },
    );

    const { data, extras } = await useCase.execute(input, adminCtx);

    expect(data.delivery).toEqual({ status: 'failed' });
    expect(data).not.toHaveProperty('temporaryPassword');
    expect(extras.message).toBe(
      'Não foi possível enviar o convite por e-mail. Reemita o convite ou gere uma senha provisória.',
    );
  });

  it('com SMTP ligado, o admin ainda pode pedir a senha provisoria', async () => {
    const { users, delivery, useCase } = setup(
      { kind: 'created', user: userRow({ status: 'pending' }), mail: null },
      { smtp: true },
    );

    const { data } = await useCase.execute(
      { ...input, channel: 'temporary_password' },
      adminCtx,
    );

    expect(data.channel).toBe('temporary_password');
    expect(data.temporaryPassword).toHaveLength(20);
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(
      (users.create.mock.calls as [[CreateUserCommand]])[0][0].invitation
        .channel,
    ).toBe('temporary_password');
  });

  it('canal email com SMTP desligado responde 422 antes de qualquer escrita', async () => {
    const { users, useCase } = setup({
      kind: 'created',
      user: userRow(),
      mail: null,
    });

    const error = await captureError(
      useCase.execute({ ...input, channel: 'email' }, adminCtx),
    );

    expect(error).toMatchObject({
      code: 'USER_INVITATION_EMAIL_UNAVAILABLE',
      status: 422,
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('no limite do plano nao envia nada', async () => {
    const { delivery, useCase } = setup(
      { kind: 'limit_reached' },
      { smtp: true },
    );

    await captureError(useCase.execute(input, adminCtx));

    expect(delivery.deliver).not.toHaveBeenCalled();
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
