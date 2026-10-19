import { randomUUID } from 'node:crypto';

interface RequestWithId {
  /** `pino-http` define o id como string ou numero. */
  id?: string | number;
  /** Cache do id resolvido, para interceptor e filtro concordarem. */
  vitacareRequestId?: string;
}

/**
 * Id de correlacao da requisicao. Usa o id do pino-http quando existe e gera um
 * UUID quando nao existe, memorizando na propria requisicao para que a mesma
 * requisicao nunca produza dois ids diferentes.
 */
export const resolveRequestId = (request: unknown): string => {
  const target = (request ?? {}) as RequestWithId;

  if (typeof target.vitacareRequestId === 'string') {
    return target.vitacareRequestId;
  }

  const resolved =
    target.id === undefined || target.id === null
      ? randomUUID()
      : String(target.id);

  target.vitacareRequestId = resolved;
  return resolved;
};

/** Formato aceito no header: o `$request_id` do nginx (32 hex) ou um UUID. */
const INCOMING_ID = /^[A-Za-z0-9-]{16,64}$/;

/**
 * `genReqId` do pino-http. Adota o `X-Request-Id` do gateway, para que a linha
 * do nginx e o log da API tenham o mesmo id no Loki; header ausente ou fora do
 * formato (injecao de texto no log) gera um UUID novo.
 */
export const requestIdFromHeaders = (request: {
  headers: Record<string, string | string[] | undefined>;
}): string => {
  const incoming = request.headers['x-request-id'];

  return typeof incoming === 'string' && INCOMING_ID.test(incoming)
    ? incoming
    : randomUUID();
};
