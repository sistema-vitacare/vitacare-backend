import { DomainException } from '@/common/errors/domain.exception';

import { AuthRateLimiter } from '@/modules/Auth/security/authRateLimiter';

const limits: Record<string, number> = {
  'auth.loginMaxFailures': 5,
  'auth.loginBlockSeconds': 900,
  'auth.loginWindowSeconds': 900,
  'auth.recoveryWindowSeconds': 3600,
  'auth.recoveryMaxPerAccount': 3,
  'auth.recoveryMaxPerIp': 10,
};

const config = { getOrThrow: jest.fn((key: string) => limits[key]) };

const build = (redis: Record<string, jest.Mock>): AuthRateLimiter =>
  new AuthRateLimiter(redis as never, config as never);

describe('AuthRateLimiter', () => {
  it('nunca usa a identidade em claro na chave de contagem', async () => {
    const redis = { getNumber: jest.fn().mockResolvedValue(0) };
    const limiter = build(redis);

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

  it('bloqueia a partir da quinta falha registrada na janela', async () => {
    const redis = { getNumber: jest.fn().mockResolvedValue(5) };
    const limiter = build(redis);

    await expect(
      limiter.assertLoginAllowed('clinica-a', 'user@example.test', '127.0.0.1'),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_TEMPORARILY_BLOCKED',
    });
  });

  it('conta falha por conta e por IP com o TTL de bloqueio', async () => {
    const redis = {
      incrementWithTtl: jest.fn().mockResolvedValue(1),
    };
    const limiter = build(redis);

    await limiter.recordLoginFailure(
      'clinica-a',
      'user@example.test',
      '127.0.0.1',
    );

    expect(redis.incrementWithTtl).toHaveBeenCalledTimes(2);
    expect(redis.incrementWithTtl.mock.calls[0] as [string, number]).toEqual([
      expect.any(String),
      900,
    ]);
  });

  it('zera apenas a contagem da conta apos login valido', async () => {
    const redis = { delete: jest.fn().mockResolvedValue(undefined) };
    const limiter = build(redis);

    await limiter.clearLoginFailures('clinica-a', 'user@example.test');

    expect(redis.delete).toHaveBeenCalledTimes(1);
  });

  it('limita recuperacao por conta e por IP na janela de uma hora', async () => {
    const redis = {
      getNumber: jest.fn().mockResolvedValue(0),
      incrementWithTtl: jest.fn().mockResolvedValue(1),
    };
    const limiter = build(redis);

    await limiter.assertRecoveryAllowed(
      'clinica-a',
      'user@example.test',
      '127.0.0.1',
    );

    expect(redis.incrementWithTtl).toHaveBeenCalledTimes(2);
    expect(redis.incrementWithTtl.mock.calls[0] as [string, number]).toEqual([
      expect.any(String),
      3600,
    ]);
  });

  it('bloqueia a quarta recuperacao da mesma conta', async () => {
    const redis = {
      getNumber: jest.fn().mockResolvedValue(3),
      incrementWithTtl: jest.fn().mockResolvedValue(4),
    };
    const limiter = build(redis);

    await expect(
      limiter.assertRecoveryAllowed(
        'clinica-a',
        'user@example.test',
        '127.0.0.1',
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_TEMPORARILY_BLOCKED',
    });
  });

  it('traduz falha do Redis em indisponibilidade, sem liberar a tentativa', async () => {
    const redis = {
      getNumber: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const limiter = build(redis);

    await expect(
      limiter.assertLoginAllowed('clinica-a', 'user@example.test', '127.0.0.1'),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_DEPENDENCY_UNAVAILABLE',
    });
  });
});
