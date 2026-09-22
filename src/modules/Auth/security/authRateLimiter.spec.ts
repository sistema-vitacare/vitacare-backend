import { AuthRateLimiter } from './authRateLimiter';

describe('AuthRateLimiter', () => {
  it('hashes identifiers before creating login keys', async () => {
    const redis = { getNumber: jest.fn().mockResolvedValue(0) };
    const limiter = new AuthRateLimiter(redis as never);

    await limiter.assertLoginAllowed(
      'clinica-a',
      'user@example.test',
      '127.0.0.1',
    );

    expect(redis.getNumber).toHaveBeenCalledTimes(2);
    expect(redis.getNumber.mock.calls.flat().join(' ')).not.toContain(
      'user@example.test',
    );
  });

  it('registra falhas, limpa a chave de conta e limita recuperacao', async () => {
    const redis = {
      getNumber: jest.fn().mockResolvedValue(0),
      incrementWithTtl: jest.fn().mockResolvedValue(1),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const limiter = new AuthRateLimiter(redis as never);

    await limiter.recordLoginFailure(
      'clinica-a',
      'user@example.test',
      '127.0.0.1',
    );
    await limiter.clearLoginFailures('clinica-a', 'user@example.test');
    await limiter.assertRecoveryAllowed(
      'clinica-a',
      'user@example.test',
      '127.0.0.1',
    );

    expect(redis.incrementWithTtl).toHaveBeenCalledTimes(4);
    expect(redis.delete).toHaveBeenCalledTimes(1);
  });
});
