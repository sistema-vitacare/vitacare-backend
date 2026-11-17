import { type RenderedEmail, renderEmail } from '@/common/mail/emailLayout';

import type { PasswordRecoveryMessage } from '../mail/passwordRecoveryMailer';

/**
 * E-mail de recuperacao de senha (UC02): o link e a validade. Nao diz quem e
 * o usuario nem qual organizacao.
 */
export const passwordRecoveryEmail = (
  message: Pick<PasswordRecoveryMessage, 'resetUrl' | 'expiresInMinutes'>,
): RenderedEmail =>
  renderEmail({
    subject: 'Redefinição de senha VitaCare',
    preheader: `O link expira em ${message.expiresInMinutes} minutos.`,
    title: 'Redefinição de senha',
    paragraphs: [
      `Use o link para redefinir a senha. Ele expira em ${message.expiresInMinutes} minutos.`,
    ],
    action: { label: 'Redefinir senha', url: message.resetUrl },
  });
