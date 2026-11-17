import type { EmailAttachment } from '@/common/mail/emailLayout';

import type { DeliveryResult } from './deliveryResult.type';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/**
 * `text` e sempre enviado e e o fallback; `html` e `attachments` (a logo por
 * CID) vem juntos de `renderEmail` (`src/common/mail/emailLayout.ts`).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailSender {
  readonly enabled: boolean;

  send(message: EmailMessage): Promise<DeliveryResult>;
}
