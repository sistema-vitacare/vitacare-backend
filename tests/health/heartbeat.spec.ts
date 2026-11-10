import type { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import type { DataSource } from 'typeorm';

import operationsConfig from '@/config/operations.config';
import { environmentValidationSchema } from '@/config/env.validation';
import {
  HEARTBEAT_EVERY_MS,
  HEARTBEAT_JOB,
  HeartbeatProcessor,
} from '@/health/heartbeat/heartbeat.processor';
import { sendHeartbeat } from '@/health/heartbeat/sendHeartbeat';

const PUSH_URL = 'http://uptime-kuma:3001/api/push/token-sintetico';

const okResponse = () =>
  Promise.resolve(new Response('{"ok":true}', { status: 200 }));

describe('sendHeartbeat', () => {
  it('envia o pulso com status=up quando o banco responde', async () => {
    const fetch = jest.fn(okResponse);
    const pingDatabase = jest.fn(() => Promise.resolve());

    await expect(
      sendHeartbeat({ pushUrl: PUSH_URL, pingDatabase, fetch }),
    ).resolves.toBe('sent');

    expect(pingDatabase).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(`${PUSH_URL}?status=up&msg=OK`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('nao envia pulso com o banco fora', async () => {
    const fetch = jest.fn(okResponse);

    await expect(
      sendHeartbeat({
        pushUrl: PUSH_URL,
        pingDatabase: () => Promise.reject(new Error('ECONNREFUSED')),
        fetch,
      }),
    ).resolves.toBe('database_down');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['rejeita', () => Promise.reject(new Error('ENOTFOUND'))],
    ['responde 500', () => Promise.resolve(new Response('', { status: 500 }))],
  ])('Kuma que %s vira push_failed sem lancar', async (_, response) => {
    await expect(
      sendHeartbeat({
        pushUrl: PUSH_URL,
        pingDatabase: () => Promise.resolve(),
        fetch: jest.fn(response),
      }),
    ).resolves.toBe('push_failed');
  });

  it('Kuma que nao responde termina em push_failed no timeout', async () => {
    const hanging = (_url: URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      );

    await expect(
      sendHeartbeat({
        pushUrl: PUSH_URL,
        pingDatabase: () => Promise.resolve(),
        fetch: hanging as typeof fetch,
        timeoutMs: 50,
      }),
    ).resolves.toBe('push_failed');
  });
});

describe('configuracao do heartbeat', () => {
  const base = {
    DB_HOST: 'postgresql',
    DB_USERNAME: 'vitacare',
    DB_PASSWORD: 'x',
    DB_DATABASE: 'vitacare',
    REDIS_HOST: 'redis',
  };
  const original = process.env.UPTIME_KUMA_PUSH_URL;

  afterEach(() => {
    process.env.UPTIME_KUMA_PUSH_URL = original;
  });

  it('URL vazia desliga o heartbeat', () => {
    process.env.UPTIME_KUMA_PUSH_URL = '';
    expect(operationsConfig().uptimeKumaPushUrl).toBeUndefined();
  });

  it('aceita URL http e recusa outro formato', () => {
    const validate = (value: string) =>
      environmentValidationSchema.validate({
        ...base,
        UPTIME_KUMA_PUSH_URL: value,
      }).error?.message;

    expect(validate(PUSH_URL)).toBeUndefined();
    expect(validate('')).toBeUndefined();
    expect(validate('nao-e-url')).toContain('UPTIME_KUMA_PUSH_URL');
  });
});

describe('HeartbeatProcessor', () => {
  const queue = {
    upsertJobScheduler: jest.fn(),
    removeJobScheduler: jest.fn(),
  };
  const dataSource = { query: jest.fn() };
  const build = (pushUrl: string | undefined) =>
    new HeartbeatProcessor(
      queue as unknown as Queue,
      { get: () => pushUrl } as unknown as ConfigService,
      dataSource as unknown as DataSource,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    queue.upsertJobScheduler.mockResolvedValue(undefined);
    queue.removeJobScheduler.mockResolvedValue(true);
  });

  it('agenda o pulso a cada 5 min quando ha URL', () => {
    build(PUSH_URL).onApplicationBootstrap();

    expect(HEARTBEAT_EVERY_MS).toBe(300_000);
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      HEARTBEAT_JOB,
      { every: HEARTBEAT_EVERY_MS },
      expect.objectContaining({ name: HEARTBEAT_JOB }),
    );
  });

  it('sem URL remove um agendamento antigo e nao agenda', () => {
    build(undefined).onApplicationBootstrap();

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(HEARTBEAT_JOB);
  });

  it('nao derruba a subida se o Redis recusar o agendamento', async () => {
    queue.upsertJobScheduler.mockRejectedValue(new Error('ECONNREFUSED'));

    expect(() => build(PUSH_URL).onApplicationBootstrap()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('sem URL o job agendado antes nao envia nada', async () => {
    await expect(
      build(undefined).process({ name: HEARTBEAT_JOB } as Job),
    ).resolves.toBe('disabled');
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('recusa job desconhecido', async () => {
    await expect(
      build(PUSH_URL).process({ name: 'outro' } as Job),
    ).rejects.toThrow('outro');
  });
});
