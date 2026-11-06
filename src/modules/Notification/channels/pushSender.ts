import type { DeliveryResult } from './deliveryResult.type';

export const PUSH_SENDER = Symbol('PUSH_SENDER');

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSender {
  readonly enabled: boolean;

  send(target: PushTarget, payload: string): Promise<DeliveryResult>;
}
