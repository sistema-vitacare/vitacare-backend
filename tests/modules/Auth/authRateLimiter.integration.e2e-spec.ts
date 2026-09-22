import Redis from 'ioredis';

import { DomainException } from '@/common/errors/domain.exception';
import { RedisService } from '@/redis/redis.service';
import { AuthRateLimiter } from '@/modules/Auth/security/authRateLimiter';

/**
 * Limite de abuso contra o Redis **real**, nao contra dublê. Roda so com
 * `VITACARE_TEST_REDIS_URL` apontando para um Redis onde apagar chaves seja
 * aceitavel; sem a variavel, a suite pula.
 */
const redisUrl = process.env.VITACARE_TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

const LIMITS: Record<string, number> = {
  'auth.loginMaxFailures': 5,
  'auth.loginBlockSeconds': 900,
  'auth.loginWindowSeconds': 900,
  'auth.recoveryWindowSeconds': 3600,
  'auth.recoveryMaxPerAccount': 3,
  'auth.recoveryMaxPerIp': 10,
};

/** Prefixo proprio do teste: nao colide com chave de aplicacao. */
const KEY_PREFIX = 'vitacare-test:';

describeWithRedis('limite de abuso em Redis real', () => {
  let client: Redis;
  let limiter: AuthRateLimiter;

  const organizationCode = 'clinica-integracao';
  const email = 'integracao@example.test';
  const ip = '198.51.100.7';

  const config = { getOrThrow: (key: string) => LIMITS[key] } as never;

  /**
   * `KEYS` nao recebe o `keyPrefix` do ioredis e devolve a chave completa;
   * `DEL` e `GET` recebem. Por isso o padrao vai com prefixo e a chave volta
   * sem ele antes de qualquer outra operacao.
   */
  const keysOfTest = async (): Promise<string[]> =>
    (await client.keys(`${KEY_PREFIX}auth:*`)).map((key) =>
      key.slice(KEY_PREFIX.length),
    );

  const clean = async (): Promise<void> => {
    const keys = await keysOfTest();

    if (keys.length > 0) {
      await client.del(...keys);
    }
  };

  beforeAll(async () => {
    client = new Redis(redisUrl!, {
      keyPrefix: KEY_PREFIX,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    await client.connect();

    limiter = new AuthRateLimiter(new RedisService(client), config);
  }, 30000);

  afterAll(async () => {
    if (client) {
      await clean();
      await client.quit();
    }
  }, 30000);

  beforeEach(clean);

  it('responde ao PING, provando que o Redis configurado esta acessivel', async () => {
    await expect(client.ping()).resolves.toBe('PONG');
  });

  it('libera as quatro primeiras falhas e bloqueia a partir da quinta', async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(
        limiter.assertLoginAllowed(organizationCode, email, ip),
      ).resolves.toBeUndefined();

      await limiter.recordLoginFailure(organizationCode, email, ip);
    }

    await expect(
      limiter.assertLoginAllowed(organizationCode, email, ip),
    ).resolves.toBeUndefined();

    await limiter.recordLoginFailure(organizationCode, email, ip);

    await expect(
      limiter.assertLoginAllowed(organizationCode, email, ip),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_TEMPORARILY_BLOCKED',
    });
  }, 30000);

  it('aplica TTL de bloqueio, entao o bloqueio expira sozinho', async () => {
    await limiter.recordLoginFailure(organizationCode, email, ip);

    const keys = await keysOfTest();
    const ttls = await Promise.all(keys.map((key) => client.ttl(key)));

    expect(keys).toHaveLength(2);

    for (const ttl of ttls) {
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);
    }
  }, 30000);

  it('nunca grava e-mail legivel na chave', async () => {
    await limiter.recordLoginFailure(organizationCode, email, ip);

    const keys = await keysOfTest();

    expect(keys.join(' ')).not.toContain(email);
    expect(keys.join(' ')).not.toContain(organizationCode);
    expect(keys.join(' ')).not.toContain(ip);
  }, 30000);

  it('login valido zera a contagem da conta, mas nao a do IP', async () => {
    await limiter.recordLoginFailure(organizationCode, email, ip);
    await limiter.recordLoginFailure(organizationCode, email, ip);

    await limiter.clearLoginFailures(organizationCode, email);

    const remaining = await keysOfTest();

    expect(remaining).toHaveLength(1);
    expect(await client.get(remaining[0])).toBe('2');
  }, 30000);

  it('conta recuperacao por conta e bloqueia a quarta solicitacao', async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(
        limiter.assertRecoveryAllowed(organizationCode, email, ip),
      ).resolves.toBeUndefined();
    }

    await expect(
      limiter.assertRecoveryAllowed(organizationCode, email, ip),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_TEMPORARILY_BLOCKED',
    });
  }, 30000);

  it('Redis fora do ar vira indisponibilidade, nunca tentativa liberada', async () => {
    const offline = new Redis({
      host: '127.0.0.1',
      port: 6390,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });

    offline.on('error', () => undefined);

    const isolated = new AuthRateLimiter(new RedisService(offline), config);

    await expect(
      isolated.assertLoginAllowed(organizationCode, email, ip),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_DEPENDENCY_UNAVAILABLE',
    });

    offline.disconnect();
  }, 30000);
});
