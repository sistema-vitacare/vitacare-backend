import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { DomainException } from '@/common/errors/domain.exception';
import { RedisService } from '@/redis/redis.service';

import { AuthErrors } from '../auth.errors';

/**
 * Limite de abuso de login e de recuperacao. O Redis conta tentativas, nunca
 * guarda identidade: a chave e o SHA-256 do par organizacao/e-mail ou do IP.
 * Redis indisponivel derruba a operacao com `AUTH_DEPENDENCY_UNAVAILABLE`, em
 * vez de liberar a tentativa sem protecao.
 */
@Injectable()
export class AuthRateLimiter {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async assertLoginAllowed(
    organizationCode: string,
    email: string,
    ip: string,
  ): Promise<void> {
    const limit = this.config.getOrThrow<number>('auth.loginMaxFailures');

    await this.guardDependency(async () => {
      const keys = [
        this.accountKey('login-account', organizationCode, email),
        this.key('login-ip', ip),
      ];

      for (const key of keys) {
        await this.assertUnderLimit(key, limit, 'tentativas');
      }
    });
  }

  async recordLoginFailure(
    organizationCode: string,
    email: string,
    ip: string,
  ): Promise<void> {
    const ttl = this.config.getOrThrow<number>('auth.loginBlockSeconds');

    await this.guardDependency(async () => {
      await Promise.all([
        this.redis.incrementWithTtl(
          this.accountKey('login-account', organizationCode, email),
          ttl,
        ),
        this.redis.incrementWithTtl(this.key('login-ip', ip), ttl),
      ]);
    });
  }

  async clearLoginFailures(
    organizationCode: string,
    email: string,
  ): Promise<void> {
    await this.guardDependency(async () => {
      await this.redis.delete(
        this.accountKey('login-account', organizationCode, email),
      );
    });
  }

  async assertRecoveryAllowed(
    organizationCode: string,
    email: string,
    ip: string,
  ): Promise<void> {
    const ttl = this.config.getOrThrow<number>('auth.recoveryWindowSeconds');

    const limits: Array<[string, number]> = [
      [
        this.accountKey('recovery-account', organizationCode, email),
        this.config.getOrThrow<number>('auth.recoveryMaxPerAccount'),
      ],
      [
        this.key('recovery-ip', ip),
        this.config.getOrThrow<number>('auth.recoveryMaxPerIp'),
      ],
    ];

    await this.guardDependency(async () => {
      for (const [key, limit] of limits) {
        await this.assertUnderLimit(key, limit, 'solicitações');
        await this.redis.incrementWithTtl(key, ttl);
      }
    });
  }

  private async assertUnderLimit(
    key: string,
    limit: number,
    subject: string,
  ): Promise<void> {
    const current = (await this.redis.getNumber(key)) ?? 0;

    if (current >= limit) {
      throw new DomainException({
        ...AuthErrors.TEMPORARILY_BLOCKED,
        detail: `Limite temporário de ${subject} atingido.`,
      });
    }
  }

  /** Falha de Redis vira indisponibilidade; o bloqueio de abuso passa reto. */
  private async guardDependency(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (error instanceof DomainException) {
        throw error;
      }

      throw new DomainException({
        ...AuthErrors.DEPENDENCY_UNAVAILABLE,
        detail: 'Redis indisponível para proteção contra abuso.',
        cause: error,
      });
    }
  }

  private accountKey(
    scope: string,
    organizationCode: string,
    email: string,
  ): string {
    return this.key(
      scope,
      `${organizationCode.toLowerCase()}:${email.toLowerCase()}`,
    );
  }

  private key(scope: string, value: string): string {
    return `auth:${scope}:${createHash('sha256').update(value).digest('hex')}`;
  }
}
