import Redis from 'ioredis';

import { RedisThrottlerStorage } from '@/redis/redisThrottler.storage';

/**
 * Rate limit global contra o Redis **real**. Duas instancias do storage fazem
 * o papel de duas replicas da API: o limite tem que ser um so. Roda apenas com
 * `VITACARE_TEST_REDIS_URL` (banco logico descartavel); sem ela, pula.
 */
const redisUrl = process.env.VITACARE_TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

const KEY_PREFIX = 'vitacare-test:';

describeWithRedis('rate limit global em Redis real', () => {
  let replicaA: Redis;
  let replicaB: Redis;

  const clean = async (): Promise<void> => {
    const keys = (await replicaA.keys(`${KEY_PREFIX}throttle:*`)).map((key) =>
      key.slice(KEY_PREFIX.length),
    );

    if (keys.length > 0) {
      await replicaA.del(...keys);
    }
  };

  const connect = async (): Promise<Redis> => {
    const client = new Redis(redisUrl!, {
      keyPrefix: KEY_PREFIX,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    await client.connect();
    return client;
  };

  beforeAll(async () => {
    replicaA = await connect();
    replicaB = await connect();
  }, 30000);

  afterAll(async () => {
    await clean();
    await replicaA.quit();
    await replicaB.quit();
  }, 30000);

  beforeEach(clean);

  it('soma os hits das duas replicas no mesmo balde', async () => {
    const a = new RedisThrottlerStorage(replicaA);
    const b = new RedisThrottlerStorage(replicaB);

    await a.increment('cliente', 60000, 3, 60000, 'default');
    await b.increment('cliente', 60000, 3, 60000, 'default');
    const third = await a.increment('cliente', 60000, 3, 60000, 'default');
    const fourth = await b.increment('cliente', 60000, 3, 60000, 'default');

    expect(third).toMatchObject({ totalHits: 3, isBlocked: false });
    expect(fourth).toMatchObject({ totalHits: 4, isBlocked: true });
    expect(fourth.timeToBlockExpire).toBeGreaterThan(0);
  });

  it('mantem o bloqueio para a outra replica e nao conta hit bloqueado', async () => {
    const a = new RedisThrottlerStorage(replicaA);
    const b = new RedisThrottlerStorage(replicaB);

    await a.increment('cliente', 60000, 1, 60000, 'default');
    await a.increment('cliente', 60000, 1, 60000, 'default');
    const blocked = await b.increment('cliente', 60000, 1, 60000, 'default');

    expect(blocked).toMatchObject({ totalHits: 2, isBlocked: true });
  });

  it('expira a janela sozinha e grava com o prefixo da aplicacao', async () => {
    const a = new RedisThrottlerStorage(replicaA);

    const record = await a.increment('cliente', 60000, 10, 60000, 'default');
    const ttl = await replicaA.pttl('throttle:default:cliente');

    expect(record.timeToExpire).toBeLessThanOrEqual(60);
    expect(ttl).toBeGreaterThan(0);
    await expect(
      replicaA.keys(`${KEY_PREFIX}throttle:default:cliente`),
    ).resolves.toHaveLength(1);
  });
});
