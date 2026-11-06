import { ConfigService } from '@nestjs/config';
import webpush, { type RequestOptions } from 'web-push';

import type { DeliveryResult } from './deliveryResult.type';
import type { PushSender, PushTarget } from './pushSender';

/** Servico de push guarda a mensagem por ate um dia se o aparelho estiver off. */
const TTL_SECONDS = 86_400;
const TIMEOUT_MS = 10_000;

/** Web Push (RFC 8030/8291/8292) com as chaves VAPID do servidor. */
export class WebPushSender implements PushSender {
  readonly enabled = true;

  private readonly options: RequestOptions;

  constructor(config: ConfigService) {
    this.options = {
      vapidDetails: {
        subject: config.getOrThrow<string>('notification.pushSubject'),
        publicKey: config.getOrThrow<string>('notification.pushPublicKey'),
        privateKey: config.getOrThrow<string>('notification.pushPrivateKey'),
      },
      TTL: TTL_SECONDS,
      timeout: TIMEOUT_MS,
    };
  }

  async send(target: PushTarget, payload: string): Promise<DeliveryResult> {
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        payload,
        this.options,
      );

      return { kind: 'sent' };
    } catch (error) {
      return classify(error);
    }
  }
}

const classify = (error: unknown): DeliveryResult => {
  const status = (error as { statusCode?: unknown }).statusCode;

  if (typeof status !== 'number')
    return { kind: 'retry', code: 'PUSH_NETWORK' };
  if (status === 404 || status === 410) {
    return { kind: 'expired', code: 'PUSH_SUBSCRIPTION_GONE' };
  }
  if (status === 429 || status >= 500) {
    return { kind: 'retry', code: `PUSH_HTTP_${status}` };
  }

  return { kind: 'failed', code: `PUSH_HTTP_${status}` };
};
