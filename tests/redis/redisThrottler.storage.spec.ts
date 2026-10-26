import type Redis from 'ioredis';

import { RedisThrottlerStorage } from '@/redis/redisThrottler.storage';

describe('RedisThrottlerStorage', () => {
  it('converte a resposta do script para o registro do throttler', async () => {
    const client = {
      status: 'ready',
      eval: jest.fn().mockResolvedValue([3, 59001, 0, 0]),
    };
    const storage = new RedisThrottlerStorage(client as unknown as Redis);

    await expect(
      storage.increment('ip-hash', 60000, 120, 60000, 'default'),
    ).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(client.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'throttle:default:ip-hash',
      'throttle:default:ip-hash:blocked',
      60000,
      120,
      60000,
    );
  });

  it('libera o request quando o Redis falha, em vez de derrubar a API', async () => {
    const client = {
      eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const storage = new RedisThrottlerStorage(client as unknown as Redis);

    const record = await storage.increment('k', 60000, 1, 60000, 'default');

    expect(record.isBlocked).toBe(false);
    expect(record.totalHits).toBe(0);
  });

  it('nao espera o Redis reconectar: libera sem enviar comando', async () => {
    const client = { status: 'reconnecting', eval: jest.fn() };
    const storage = new RedisThrottlerStorage(client as unknown as Redis);

    const record = await storage.increment('k', 60000, 1, 60000, 'default');

    expect(record.isBlocked).toBe(false);
    expect(client.eval).not.toHaveBeenCalled();
  });
});
