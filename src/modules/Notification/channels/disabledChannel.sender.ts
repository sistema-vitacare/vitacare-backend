import type { DeliveryResult } from './deliveryResult.type';
import type { EmailSender } from './emailSender';
import type { PushSender } from './pushSender';

/** Canal sem configuracao no servidor (SMTP ou VAPID): nada sai. */
export class DisabledChannelSender implements PushSender, EmailSender {
  readonly enabled = false;

  send(): Promise<DeliveryResult> {
    return Promise.resolve({ kind: 'disabled' });
  }
}
