import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';

import { createSmtpTransport } from '@/common/mail/smtpTransport';

import type {
  PasswordRecoveryMailer,
  PasswordRecoveryMessage,
} from './passwordRecoveryMailer';

@Injectable()
export class SmtpPasswordRecoveryMailer implements PasswordRecoveryMailer {
  readonly enabled = true;

  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from = config.getOrThrow<string>('mail.from');
    this.transport = createSmtpTransport(config);
  }

  /** A mensagem nao diz quem e o usuario nem qual organizacao. */
  async send(message: PasswordRecoveryMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: 'Redefinição de senha VitaCare',
      text: `Use o link para redefinir a senha. Ele expira em ${message.expiresInMinutes} minutos: ${message.resetUrl}`,
    });
  }
}
