/**
 * Servicos de push dos navegadores (Chrome/Edge via FCM, Firefox, Windows,
 * Safari). A API faz POST no `endpoint` que o cliente envia, entao so aceita
 * estes hosts, para nao virar um proxy para endereco arbitrario (SSRF).
 */
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

  if (
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
