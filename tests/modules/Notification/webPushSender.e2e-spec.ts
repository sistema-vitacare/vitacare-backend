import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import webpush from 'web-push';

import { WebPushSender } from '@/modules/Notification/channels/webPush.sender';

interface Received {
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/**
 * A lib `web-push` real contra um servico de push falso em HTTPS local: confere
 * a criptografia (aes128gcm), o cabecalho VAPID e a classificacao das
 * respostas. O certificado autoassinado so e confiado neste processo.
 */
describe('WebPushSender com a lib real (e2e)', () => {
  const vapid = webpush.generateVAPIDKeys();
  const ecdh = createECDH('prime256v1');
  const target = {
    endpoint: '',
    p256dh: ecdh.generateKeys().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
  const received: Received[] = [];
  let status = 201;
  let dir: string;
  let server: https.Server;
  let originalCa: unknown;
  let sender: WebPushSender;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vitacare-push-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        join(dir, 'key.pem'),
        '-out',
        join(dir, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );

    const cert = readFileSync(join(dir, 'cert.pem'));

    server = https.createServer(
      { key: readFileSync(join(dir, 'key.pem')), cert },
      (request, response) => {
        const chunks: Buffer[] = [];

        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          received.push({
            headers: request.headers,
            body: Buffer.concat(chunks),
          });
          response.writeHead(status).end();
        });
      },
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );

    originalCa = https.globalAgent.options.ca;
    https.globalAgent.options.ca = cert;
    target.endpoint = `https://127.0.0.1:${(server.address() as AddressInfo).port}/push/abc`;

    const settings: Record<string, unknown> = {
      'notification.pushPublicKey': vapid.publicKey,
      'notification.pushPrivateKey': vapid.privateKey,
      'notification.pushSubject': 'mailto:suporte@example.com',
    };

    sender = new WebPushSender({
      getOrThrow: (key: string) => settings[key],
    } as never);
  });

  afterAll(async () => {
    https.globalAgent.options.ca = originalCa as never;
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    received.length = 0;
  });

  it('envia cifrado com VAPID e TTL de um dia', async () => {
    status = 201;
    const payload = JSON.stringify({
      title: 'Alerta crítico',
      body: 'Paciente: Maria',
    });

    expect(await sender.send(target, payload)).toEqual({ kind: 'sent' });
    expect(sender.enabled).toBe(true);

    const [request] = received;

    expect(request.headers['content-encoding']).toBe('aes128gcm');
    expect(request.headers.ttl).toBe('86400');
    expect(request.headers.authorization).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`),
    );
    expect(request.body.includes(Buffer.from('Maria'))).toBe(false);
  });

  it.each([
    [410, { kind: 'expired', code: 'PUSH_SUBSCRIPTION_GONE' }],
    [404, { kind: 'expired', code: 'PUSH_SUBSCRIPTION_GONE' }],
    [429, { kind: 'retry', code: 'PUSH_HTTP_429' }],
    [500, { kind: 'retry', code: 'PUSH_HTTP_500' }],
    [503, { kind: 'retry', code: 'PUSH_HTTP_503' }],
    [400, { kind: 'failed', code: 'PUSH_HTTP_400' }],
    [413, { kind: 'failed', code: 'PUSH_HTTP_413' }],
  ])('resposta %i vira %o', async (code, result) => {
    status = code;

    expect(await sender.send(target, '{}')).toEqual(result);
  });

  it('servico fora do ar vira nova tentativa', async () => {
    const closed = https.createServer();

    await new Promise<void>((resolve) =>
      closed.listen(0, '127.0.0.1', resolve),
    );
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));

    expect(
      await sender.send(
        { ...target, endpoint: `https://127.0.0.1:${port}/x` },
        '{}',
      ),
    ).toEqual({ kind: 'retry', code: 'PUSH_NETWORK' });
  });
});
