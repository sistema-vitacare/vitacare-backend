import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import type { EmailMessage } from '@/modules/Notification/channels/emailSender';
import { invitationEmail } from '@/modules/User/policies/invitationEmail.policy';
import { UserInvitationDeliveryService } from '@/modules/User/services/userInvitationDelivery.service';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  TARGET_ID,
  captureError,
  mailContext,
} from './user.fixtures';

const SETTINGS: Record<string, unknown> = {
  'auth.invitationSeconds': 72 * 3600,
  'mail.invitationAcceptUrl': 'https://app.example.test/aceitar-convite',
};

const setup = (
  options: {
    enabled?: boolean;
    result?: DeliveryResult;
    throws?: boolean;
  } = {},
) => {
  const email = {
    enabled: options.enabled ?? true,
    send: jest.fn((message: EmailMessage) => {
      void message;

      return options.throws
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(options.result ?? { kind: 'sent' as const });
    }),
  };
  const invitations = {
    recordSent: jest.fn().mockResolvedValue(undefined),
    recordSendFailure: jest.fn().mockResolvedValue(undefined),
  };
  const tokens = {
    issue: jest.fn(() => ({ raw: 'token-cru-secreto', hash: 'h'.repeat(64) })),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (!(key in SETTINGS)) throw new Error(`ausente: ${key}`);

      return SETTINGS[key];
    }),
  };
  const service = new UserInvitationDeliveryService(
    email,
    invitations as never,
    tokens as never,
    config as never,
  );

  return { email, invitations, service };
};

const expiresAt = new Date('2026-11-16T15:00:00.000Z');

const dispatch = {
  actor: {
    organizationId: ORGANIZATION_ID,
    actorUserId: ACTOR_ID,
    requestId: 'req-convite',
  },
  mail: mailContext(),
  rawToken: 'token-cru-secreto',
  expiresAt,
};

const record = {
  invitationId: mailContext().invitationId,
  organizationId: ORGANIZATION_ID,
  userId: TARGET_ID,
  actorUserId: ACTOR_ID,
  requestId: 'req-convite',
  expiresAt,
};

describe('UserInvitationDeliveryService', () => {
  describe('resolveChannel', () => {
    it('sem pedido, segue o SMTP configurado', () => {
      expect(setup({ enabled: true }).service.resolveChannel()).toBe('email');
      expect(setup({ enabled: false }).service.resolveChannel()).toBe(
        'temporary_password',
      );
    });

    it('respeita a senha provisoria pedida com SMTP ligado', () => {
      expect(
        setup({ enabled: true }).service.resolveChannel('temporary_password'),
      ).toBe('temporary_password');
    });

    it('recusa email com SMTP desligado no campo channel', async () => {
      const { service } = setup({ enabled: false });

      const error = await captureError(
        Promise.resolve().then(() => service.resolveChannel('email')),
      );

      expect(error).toMatchObject({
        code: 'USER_INVITATION_EMAIL_UNAVAILABLE',
        status: 422,
        fields: [{ field: 'channel', code: 'UNAVAILABLE' }],
      });
    });
  });

  it('emite token com a validade configurada', () => {
    const before = Date.now();
    const token = setup().service.issueToken();

    expect(token).toMatchObject({
      raw: 'token-cru-secreto',
      hash: 'h'.repeat(64),
    });
    expect(token.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      72 * 3600 * 1000,
    );
  });

  it('envio aceito grava sent_at e responde sent', async () => {
    const { email, invitations, service } = setup();

    await expect(service.deliver(dispatch)).resolves.toBe('sent');

    const [[message]] = email.send.mock.calls;
    expect(message.to).toBe('usuaria@example.test');
    expect(message.text).toContain(
      'https://app.example.test/aceitar-convite?token=token-cru-secreto',
    );
    expect(invitations.recordSent).toHaveBeenCalledWith(record);
    expect(invitations.recordSendFailure).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<Parameters<typeof setup>[0]>]>([
    ['retry do SMTP', { result: { kind: 'retry', code: 'SMTP_UNAVAILABLE' } }],
    ['rejeicao do SMTP', { result: { kind: 'failed', code: 'SMTP_REJECTED' } }],
    ['porta desligada', { result: { kind: 'disabled' } }],
    ['excecao inesperada', { throws: true }],
  ])('%s revoga o link e responde failed', async (_label, options) => {
    const { invitations, service } = setup(options);

    await expect(service.deliver(dispatch)).resolves.toBe('failed');

    expect(invitations.recordSendFailure).toHaveBeenCalledWith(record);
    expect(invitations.recordSent).not.toHaveBeenCalled();
  });

  it('URL de aceite ausente conta como falha de envio', async () => {
    const { email, invitations, service } = setup();
    delete SETTINGS['mail.invitationAcceptUrl'];

    try {
      await expect(service.deliver(dispatch)).resolves.toBe('failed');
    } finally {
      SETTINGS['mail.invitationAcceptUrl'] =
        'https://app.example.test/aceitar-convite';
    }

    expect(email.send).not.toHaveBeenCalled();
    expect(invitations.recordSendFailure).toHaveBeenCalled();
  });

  it('falha ao registrar o resultado nao derruba a resposta', async () => {
    const { invitations, service } = setup();
    invitations.recordSent.mockRejectedValue(new Error('banco fora'));

    await expect(service.deliver(dispatch)).resolves.toBe('sent');
  });
});

describe('invitationEmail', () => {
  const message = invitationEmail({
    to: 'ana@example.test',
    userName: 'Ana Exemplo',
    organizationName: 'Casa Exemplo',
    organizationCode: 'casa-exemplo',
    inviterName: 'Admin Exemplo',
    profileName: 'Cuidador',
    acceptUrl: 'https://app.example.test/aceitar-convite?token=abc',
    expiresAt,
  });

  it('traz organizacao, codigo, autor, perfil, link e validade em Brasilia', () => {
    expect(message.subject).toBe('Convite para acessar o VitaCare');
    expect(message.to).toBe('ana@example.test');
    expect(message.text).toContain('Admin Exemplo convidou você');
    expect(message.text).toContain('organização Casa Exemplo');
    expect(message.text).toContain('perfil Cuidador');
    expect(message.text).toContain('"casa-exemplo"');
    expect(message.text).toContain(
      'https://app.example.test/aceitar-convite?token=abc',
    );
    expect(message.text).toContain('16/11/2026 às 12:00 (horário de Brasília)');
    expect(message.text).toContain(
      'Se você não esperava este convite, ignore este e-mail.',
    );
  });

  it('nao leva CPF, telefone nem id interno', () => {
    expect(message.text).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    expect(message.text).not.toMatch(/CPF|telefone/i);
    expect(message.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
