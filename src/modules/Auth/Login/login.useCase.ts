import { Injectable } from '@nestjs/common';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '../auth.errors';
import { AuthIdentityRepository } from '../repositories/authIdentity.repository';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { AuthRateLimiter } from '../security/authRateLimiter';
import { PasswordHasher } from '../security/passwordHasher';
import { TokenService } from '../security/token.service';

export interface LoginResult {
  state: 'authenticated' | 'password_change_required';
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: Date;
  idleTimeoutSeconds?: number;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly identities: AuthIdentityRepository,
    private readonly transactions: AuthTransactionRepository,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(
    input: { organizationCode: string; email: string; password: string },
    meta: { ip: string; requestId?: string },
  ): Promise<LoginResult> {
    const organizationCode = input.organizationCode.toLowerCase();
    const email = input.email.toLowerCase();
    await this.rateLimiter.assertLoginAllowed(organizationCode, email, meta.ip);
    const identity = await this.identities.findForLogin(
      organizationCode,
      email,
    );
    if (
      !identity ||
      identity.status !== 'active' ||
      identity.deletedAt ||
      identity.organizationStatus !== 'active' ||
      identity.organizationDeletedAt ||
      !identity.passwordHash ||
      !(await this.passwords.verify(identity.passwordHash, input.password))
    ) {
      await this.rateLimiter.recordLoginFailure(
        organizationCode,
        email,
        meta.ip,
      );
      throw new DomainException({
        ...AuthErrors.INVALID_CREDENTIALS,
        detail: 'Organização, conta, estado ou senha inválidos.',
      });
    }
    await this.rateLimiter.clearLoginFailures(organizationCode, email);
    const token = this.tokens.issue();
    const type = identity.mustChangePassword ? 'password_change' : 'normal';
    const expiresAt = new Date(
      Date.now() + (type === 'normal' ? 43200 : 600) * 1000,
    );
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
      ...(type === 'normal' ? { idleTimeoutSeconds: 1800 } : {}),
    };
  }
}
