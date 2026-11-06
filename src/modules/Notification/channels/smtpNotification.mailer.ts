import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';

import { createSmtpTransport } from '@/common/mail/smtpTransport';

import type { DeliveryResult } from './deliveryResult.type';
import type { EmailMessage, EmailSender } from './emailSender';

/** E-mail de notificacao pelo SMTP do projeto. */
export class SmtpNotificationMailer implements EmailSender {
  readonly enabled = true;

  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.from = config.getOrThrow<string>('mail.from');
    this.transport = createSmtpTransport(config);
  }

  async send(message: EmailMessage): Promise<DeliveryResult> {
    try {
      await this.transport.sendMail({ from: this.from, ...message });

      return { kind: 'sent' };
    } catch (error) {
      return classify(error);
    }
  }
}

/** 5xx e envelope invalido sao definitivos; 4xx e rede, temporarios. */
const classify = (error: unknown): DeliveryResult => {
  const { responseCode, code } = error as {
    responseCode?: unknown;
    code?: unknown;
  };

  if (typeof responseCode === 'number' && responseCode >= 500) {
    return { kind: 'failed', code: 'SMTP_REJECTED' };
  }
  if (code === 'EENVELOPE') return { kind: 'failed', code: 'SMTP_REJECTED' };
  if (typeof responseCode === 'number' && responseCode >= 400) {
    return { kind: 'retry', code: 'SMTP_TEMPORARY' };
  }

  return { kind: 'retry', code: 'SMTP_UNAVAILABLE' };
};
