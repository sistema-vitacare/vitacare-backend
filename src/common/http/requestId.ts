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
