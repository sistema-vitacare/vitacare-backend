import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';

export interface RequestMetadata {
  readonly ip: string | null;
}

const storage = new AsyncLocalStorage<RequestMetadata>();

/** So IP valido chega ao `inet` de `audit_events`; o resto vira `null`. */
export const normalizeIp = (raw: string | undefined): string | null =>
  raw && isIP(raw) !== 0 ? raw : null;

export const runWithRequestMetadata = <T>(
  metadata: RequestMetadata,
  fn: () => T,
): T => storage.run(metadata, fn);

/** IP do pedido HTTP em curso; `null` em job, seed ou fora de requisicao. */
export const currentRequestIp = (): string | null =>
  storage.getStore()?.ip ?? null;
