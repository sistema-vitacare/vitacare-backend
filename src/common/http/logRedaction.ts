export const REDACTED = '[Redacted]';

/** Parametros de query que podem carregar nome, e-mail ou CPF digitados. */
const SENSITIVE_QUERY_PARAMS = ['search'];

interface SerializedRequest {
  url?: string;
  query?: Record<string, unknown>;
  [key: string]: unknown;
}

const redactUrl = (url: string): string => {
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
 * Serializer de `req` do log HTTP: a busca de usuarios recebe nome ou e-mail,
 * que nao podem ir para o log nem pela URL nem pela query ja interpretada.
 */
export const redactRequestLog = <T extends SerializedRequest>(req: T): T => {
  const redacted = { ...req };

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
