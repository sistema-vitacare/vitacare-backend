import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import { AuthIdentityRepository } from '../repositories/authIdentity.repository';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { AuthRateLimiter } from '../security/authRateLimiter';
import { PasswordHasher } from '../security/passwordHasher';
import { TokenService } from '../security/token.service';
import type { LoginIdentity } from '../types/auth.types';

export interface LoginResult {
  state: 'authenticated' | 'password_change_required';
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: Date;
  idleTimeoutSeconds?: number;
}

export interface LoginInput {
  organizationCode: string;
  email: string;
  password: string;
}

export interface LoginRequestMeta {
  ip: string;
  requestId?: string;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly identities: AuthIdentityRepository,
    private readonly transactions: AuthTransactionRepository,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async execute(
    input: LoginInput,
    meta: LoginRequestMeta,
  ): Promise<LoginResult> {
    const organizationCode = input.organizationCode.toLowerCase();
    const email = input.email.toLowerCase();

    await this.rateLimiter.assertLoginAllowed(organizationCode, email, meta.ip);

    const { organizationId, identity } =
      await this.identities.findForAuthentication(organizationCode, email);

    // A verificacao roda antes do desvio para nao encurtar o caminho da falha.
    const credentialsValid = await this.hasValidCredentials(
      identity,
      input.password,
    );

    if (!identity || !credentialsValid) {
      await this.rateLimiter.recordLoginFailure(
        organizationCode,
        email,
        meta.ip,
      );

      if (organizationId) {
        await this.transactions.recordLoginFailure({
          organizationId,
          userId: identity?.userId ?? null,
          requestId: meta.requestId ?? null,
        });
      }

      throw new DomainException({
        ...AuthErrors.INVALID_CREDENTIALS,
        detail: 'Organização, conta, estado ou senha inválidos.',
      });
    }

    await this.rateLimiter.clearLoginFailures(organizationCode, email);

    const type = identity.mustChangePassword ? 'password_change' : 'normal';
    const idleTimeoutSeconds = this.config.getOrThrow<number>(
      'auth.sessionIdleSeconds',
    );

    const lifetimeSeconds = this.config.getOrThrow<number>(
      type === 'normal'
        ? 'auth.sessionAbsoluteSeconds'
        : 'auth.firstAccessSeconds',
    );

    const token = this.tokens.issue();
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000);

    await this.transactions.createLoginSession({
      organizationId: identity.organizationId,
      userId: identity.userId,
      tokenHash: token.hash,
      type,
      expiresAt,
      requestId: meta.requestId,
    });

    return {
      state: type === 'normal' ? 'authenticated' : 'password_change_required',
      accessToken: token.raw,
      tokenType: 'Bearer',
      expiresAt,
      ...(type === 'normal' ? { idleTimeoutSeconds } : {}),
    };
  }

  /**
   * Organizacao ausente ou inativa, conta ausente, inativa ou excluida, hash
   * ausente e senha errada valem o mesmo: nenhuma dessas diferencas pode
   * vazar na resposta nem no tempo gasto ate a falha.
   */
  private async hasValidCredentials(
    identity: LoginIdentity | null,
    password: string,
  ): Promise<boolean> {
    const usableHash =
      identity &&
      identity.status === 'active' &&
      identity.deletedAt === null &&
      identity.organizationStatus === 'active' &&
      identity.organizationDeletedAt === null
        ? identity.passwordHash
        : null;

    // Sem hash utilizavel ainda se gasta o tempo de uma verificacao real.
    if (!usableHash) {
      return this.passwords.verifyDummy(password);
    }

    return this.passwords.verify(usableHash, password);
  }
}
