import { parse } from 'node:url';

/**
 * Servicos de push dos navegadores (Chrome/Edge via FCM, Firefox, Windows,
 * Safari). A API faz POST no `endpoint` que o cliente envia, entao so aceita
 * estes hosts, para nao virar um proxy para endereco arbitrario (SSRF).
 */
/** So letras, digitos e hifen entre pontos: nada que o parser legado corte. */
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

const PUSH_HOSTS = [
  'fcm.googleapis.com',
  '.push.services.mozilla.com',
  '.notify.windows.com',
  '.push.apple.com',
];

export const isAllowedPushEndpoint = (endpoint: string): boolean => {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  // A lib `web-push` envia com o `url.parse` legado, que le alguns hosts de
  // outro jeito (`https://127.0.0.1;.push.apple.com` vai para 127.0.0.1): os
  // dois parsers precisam concordar no host validado.
  if (
    !HOSTNAME.test(url.hostname) ||
    parse(endpoint).hostname !== url.hostname ||
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== ''
  ) {
    return false;
  }

  return PUSH_HOSTS.some((host) =>
    host.startsWith('.') ? url.hostname.endsWith(host) : url.hostname === host,
  );
};
