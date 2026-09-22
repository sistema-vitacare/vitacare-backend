import { RedisService } from './redis.service';

describe('RedisService', () => {
  it('incrementa e define TTL somente no primeiro evento', async () => {
    const client = {
      eval: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
      get: jest.fn().mockResolvedValue('2'),
    };
    const service = new RedisService(client as never);

    await service.incrementWithTtl('auth:test', 900);
    await service.incrementWithTtl('auth:test', 900);

    expect(client.eval).toHaveBeenCalledTimes(2);
    await expect(service.getNumber('auth:test')).resolves.toBe(2);
  });
});
