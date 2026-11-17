import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';

import { createSmtpTransport } from '@/common/mail/smtpTransport';

import { passwordRecoveryEmail } from '../policies/passwordRecoveryEmail.policy';

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

  /** HTML e texto do layout padrao; a mensagem nao identifica o usuario. */
  async send(message: PasswordRecoveryMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      ...passwordRecoveryEmail(message),
    });
  }
}
