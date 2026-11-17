import { SmtpPasswordRecoveryMailer } from '@/modules/Auth/mail/smtpPasswordRecovery.mailer';
import { passwordRecoveryEmail } from '@/modules/Auth/policies/passwordRecoveryEmail.policy';

const sendMail = jest.fn();

jest.mock('@/common/mail/smtpTransport', () => ({
  createSmtpTransport: () => ({ sendMail }),
}));

const resetUrl = 'https://app.example.com/redefinir-senha?token=abc';

describe('passwordRecoveryEmail', () => {
  const email = passwordRecoveryEmail({ resetUrl, expiresInMinutes: 30 });

  it('botao "Redefinir senha", link em texto e validade', () => {
    expect(email.subject).toBe('Redefinição de senha VitaCare');
    expect(email.html).toMatch(
      /<a href="https:\/\/app\.example\.com\/redefinir-senha\?token=abc"[^>]*>Redefinir senha<\/a>/,
    );
    expect(email.html).toContain(`>${resetUrl}</a>`);
    expect(email.html).toContain('Ele expira em 30 minutos.');
    expect(email.text).toContain('Ele expira em 30 minutos.');
    expect(email.text).toContain(`Redefinir senha: ${resetUrl}`);
  });

  it('nao identifica usuario nem organizacao', () => {
    expect(email.html).not.toContain('Organização:');
    expect(email.text).not.toContain('Organização:');
    expect(email.text).not.toContain('@');
  });
});

describe('SmtpPasswordRecoveryMailer', () => {
  it('envia HTML, texto e a logo pelo transporte', async () => {
    sendMail.mockResolvedValue({});
    const mailer = new SmtpPasswordRecoveryMailer({
      getOrThrow: (key: string) =>
        ({ 'mail.from': 'no-reply@example.com' })[key],
    } as never);

    await mailer.send({
      to: 'ana@example.com',
      resetUrl,
      expiresInMinutes: 30,
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@example.com',
      to: 'ana@example.com',
      ...passwordRecoveryEmail({ resetUrl, expiresInMinutes: 30 }),
    });
  });
});
