export const REDACTED = '[Redacted]';

/** Parametros de query que podem carregar nome, e-mail ou CPF digitados. */
const SENSITIVE_QUERY_PARAMS = ['search'];

interface SerializedRequest {
  method?: string;
  url?: string;
  query?: Record<string, unknown>;
  remoteAddress?: string;
  /** Requisicao original, nao enumeravel no objeto do pino. */
  raw?: unknown;
}

/** Mascara na URL os parametros de query sensiveis. */
export const redactUrl = (url: string): string => {
  const separator = url.indexOf('?');

  if (separator === -1) {
    return url;
  }

  const params = new URLSearchParams(url.slice(separator + 1));
  const sensitive = SENSITIVE_QUERY_PARAMS.filter((name) => params.has(name));

  if (sensitive.length === 0) {
    return url;
  }

  sensitive.forEach((name) => params.set(name, REDACTED));

  return `${url.slice(0, separator)}?${params.toString()}`;
};

/**
 * IP do cliente pela regra `TRUST_PROXY` (o `req.ip` do Express), o mesmo da
 * auditoria. Sem isto o log grava o endereco do socket, que atras do Nginx
 * Proxy Manager e o do proxy.
 */
const clientIp = (raw: unknown): string | undefined => {
  const ip = (raw as { ip?: unknown } | undefined)?.ip;

  return typeof ip === 'string' && ip !== '' ? ip : undefined;
};

/**
 * Serializer de `req` do log HTTP: a busca de usuarios recebe nome ou e-mail,
 * que nao podem ir para o log nem pela URL nem pela query ja interpretada; o
 * `remoteAddress` passa a ser o IP do cliente, e nao o do proxy.
 */
export const redactRequestLog = <T extends SerializedRequest>(req: T): T => {
  const redacted = { ...req };
  const ip = clientIp(req.raw);

  if (ip) {
    redacted.remoteAddress = ip;
  }

  if (typeof req.url === 'string') {
    redacted.url = redactUrl(req.url);
  }

  if (req.query) {
    redacted.query = Object.fromEntries(
      Object.entries(req.query).map(([name, value]) => [
        name,
        SENSITIVE_QUERY_PARAMS.includes(name) ? REDACTED : value,
      ]),
    );
  }

  return redacted;
};
