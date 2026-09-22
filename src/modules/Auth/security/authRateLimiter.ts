import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DomainException } from '@/common/errors/domain.exception';
import { RedisService } from '@/redis/redis.service';
import { AuthErrors } from '../auth.errors';

@Injectable()
export class AuthRateLimiter {
  constructor(private readonly redis: RedisService) {}

  private key(scope: string, value: string): string {
    return `auth:${scope}:${createHash('sha256').update(value).digest('hex')}`;
  }

  async assertLoginAllowed(
    organizationCode: string,
    email: string,
    ip: string,
  ): Promise<void> {
    try {
      for (const key of [
        this.key(
          'login-account',
          `${organizationCode.toLowerCase()}:${email.toLowerCase()}`,
        ),
        this.key('login-ip', ip),
      ]) {
        if (((await this.redis.getNumber(key)) ?? 0) >= 5)
          throw new DomainException({
            code: 'AUTH_TEMPORARILY_BLOCKED',
            status: 429,
            message: 'Tente novamente mais tarde.',
            detail: 'Limite temporário de tentativas atingido.',
          });
      }
    } catch (error) {
      if (error instanceof DomainException) throw error;
      throw new DomainException({
        ...AuthErrors.DEPENDENCY_UNAVAILABLE,
        detail: 'Redis indisponível para proteção contra abuso.',
        cause: error,
      });
    }
  }

  async recordLoginFailure(
    organizationCode: string,
    email: string,
    ip: string,
  ): Promise<void> {
    try {
      await Promise.all([
        this.redis.incrementWithTtl(
          this.key(
            'login-account',
            `${organizationCode.toLowerCase()}:${email.toLowerCase()}`,
          ),
          900,
        ),
        this.redis.incrementWithTtl(this.key('login-ip', ip), 900),
      ]);
    } catch (error) {
      throw new DomainException({
        ...AuthErrors.DEPENDENCY_UNAVAILABLE,
        detail: 'Redis indisponível para proteção contra abuso.',
        cause: error,
      });
    }
  }

  async clearLoginFailures(
    organizationCode: string,
    email: string,
  ): Promise<void> {
    try {
      await this.redis.delete(
        this.key(
          'login-account',
          `${organizationCode.toLowerCase()}:${email.toLowerCase()}`,
        ),
      );
    } catch (error) {
      throw new DomainException({
        ...AuthErrors.DEPENDENCY_UNAVAILABLE,
        detail: 'Redis indisponível para proteção contra abuso.',
        cause: error,
      });
    }
  }

  async assertRecoveryAllowed(
    organizationCode: string,
    email: string,
    ip: string,
  ): Promise<void> {
    try {
      const limits = [
        [
          this.key(
            'recovery-account',
            `${organizationCode.toLowerCase()}:${email.toLowerCase()}`,
          ),
          3,
        ],
        [this.key('recovery-ip', ip), 10],
      ] as const;
      for (const [key, limit] of limits) {
        if (((await this.redis.getNumber(key)) ?? 0) >= limit) {
          throw new DomainException({
            code: 'AUTH_TEMPORARILY_BLOCKED',
            status: 429,
            message: 'Tente novamente mais tarde.',
            detail: 'Limite temporário de solicitações atingido.',
          });
        }
        await this.redis.incrementWithTtl(key, 3600);
      }
    } catch (error) {
      if (error instanceof DomainException) throw error;
      throw new DomainException({
        ...AuthErrors.DEPENDENCY_UNAVAILABLE,
        detail: 'Redis indisponível para proteção contra abuso.',
        cause: error,
      });
    }
  }
}
