import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

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
    const user = config.get<string>('mail.user');
    const password = config.get<string>('mail.password');

    this.from = config.getOrThrow<string>('mail.from');

    this.transport = nodemailer.createTransport({
      host: config.getOrThrow<string>('mail.host'),
      port: config.getOrThrow<number>('mail.port'),
      secure: config.getOrThrow<boolean>('mail.secure'),
      ...(user && password ? { auth: { user, pass: password } } : {}),
      connectionTimeout: config.getOrThrow<number>('mail.connectionTimeoutMs'),
      greetingTimeout: config.getOrThrow<number>('mail.greetingTimeoutMs'),
      socketTimeout: config.getOrThrow<number>('mail.socketTimeoutMs'),
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
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
