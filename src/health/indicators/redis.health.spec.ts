import { HealthIndicatorService } from '@nestjs/terminus';
import type Redis from 'ioredis';
import { RedisHealthIndicator } from './redis.health';

describe('RedisHealthIndicator', () => {
  const ping = jest.fn();
  const client = { ping } as unknown as Redis;
  const indicator = new RedisHealthIndicator(
    new HealthIndicatorService(),
    client,
  );

  beforeEach(() => jest.clearAllMocks());

  it('reporta up quando o Redis responde PONG', async () => {
    ping.mockResolvedValue('PONG');

    await expect(indicator.isHealthy('redis')).resolves.toEqual({
      redis: { status: 'up' },
    });
  });

  it('reporta down quando a conexao falha', async () => {
    ping.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(indicator.isHealthy('redis')).resolves.toEqual({
      redis: { status: 'down', message: 'ECONNREFUSED' },
    });
  });

  it('reporta down quando a resposta e inesperada', async () => {
    ping.mockResolvedValue('LOADING');

    await expect(indicator.isHealthy('redis')).resolves.toEqual({
      redis: {
        status: 'down',
        message: 'Resposta inesperada do Redis: LOADING',
      },
    });
  });
});
