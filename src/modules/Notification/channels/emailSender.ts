import type { DeliveryResult } from './deliveryResult.type';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  readonly enabled: boolean;

  send(message: EmailMessage): Promise<DeliveryResult>;
}
