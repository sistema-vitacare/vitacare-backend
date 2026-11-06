import { DisabledChannelSender } from '@/modules/Notification/channels/disabledChannel.sender';
import { SmtpNotificationMailer } from '@/modules/Notification/channels/smtpNotification.mailer';

const sendMail = jest.fn();

jest.mock('@/common/mail/smtpTransport', () => ({
  createSmtpTransport: () => ({ sendMail }),
}));

describe('SmtpNotificationMailer', () => {
  const mailer = new SmtpNotificationMailer({
    getOrThrow: (key: string) => ({ 'mail.from': 'no-reply@example.com' })[key],
  } as never);
  const message = {
    to: 'cuidador@example.com',
    subject: 'VitaCare: Alerta crítico',
    text: 'Paciente: Maria',
  };

  beforeEach(() => sendMail.mockReset());

  it('envia com o remetente configurado', async () => {
    sendMail.mockResolvedValue({});

    expect(await mailer.send(message)).toEqual({ kind: 'sent' });
    expect(mailer.enabled).toBe(true);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@example.com',
      ...message,
    });
  });

  it.each([
    [{ responseCode: 550 }, { kind: 'failed', code: 'SMTP_REJECTED' }],
    [{ code: 'EENVELOPE' }, { kind: 'failed', code: 'SMTP_REJECTED' }],
    [{ responseCode: 421 }, { kind: 'retry', code: 'SMTP_TEMPORARY' }],
    [{ code: 'ETIMEDOUT' }, { kind: 'retry', code: 'SMTP_UNAVAILABLE' }],
    [{ code: 'ECONNECTION' }, { kind: 'retry', code: 'SMTP_UNAVAILABLE' }],
  ])('erro %o vira %o', async (error, result) => {
    sendMail.mockRejectedValue(Object.assign(new Error('falha'), error));

    expect(await mailer.send(message)).toEqual(result);
  });
});

describe('DisabledChannelSender', () => {
  it('canal desligado nao envia e diz disabled', async () => {
    const sender = new DisabledChannelSender();

    expect(sender.enabled).toBe(false);
    expect(await sender.send()).toEqual({ kind: 'disabled' });
  });
});
