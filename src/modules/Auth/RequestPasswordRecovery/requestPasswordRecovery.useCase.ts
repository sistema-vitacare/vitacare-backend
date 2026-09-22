import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthIdentityRepository } from '../repositories/authIdentity.repository';
import { PasswordResetRepository } from '../repositories/passwordReset.repository';
import { AuthRateLimiter } from '../security/authRateLimiter';
import { TokenService } from '../security/token.service';
import {
  PASSWORD_RECOVERY_MAILER,
  type PasswordRecoveryMailer,
} from '../mail/passwordRecoveryMailer';

@Injectable()
export class RequestPasswordRecoveryUseCase {
  constructor(
    private readonly limiter: AuthRateLimiter,
    private readonly identities: AuthIdentityRepository,
    @Inject(PASSWORD_RECOVERY_MAILER)
    private readonly mailer: PasswordRecoveryMailer,
    private readonly tokens: TokenService,
    private readonly resets: PasswordResetRepository,
    private readonly config: ConfigService,
  ) {}
  async execute(
    input: { organizationCode: string; email: string },
    meta: { ip: string },
  ): Promise<null> {
    const organizationCode = input.organizationCode.toLowerCase();
    const email = input.email.toLowerCase();
    await this.limiter.assertRecoveryAllowed(organizationCode, email, meta.ip);
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
      !this.mailer.enabled
    )
      return null;
    const token = this.tokens.issue();
    await this.resets.create(
      identity.organizationId,
      identity.userId,
      token.hash,
      new Date(Date.now() + 900000),
    );
    const resetUrl = new URL(
      this.config.getOrThrow<string>('mail.passwordResetUrl'),
    );
    resetUrl.searchParams.set('token', token.raw);
    try {
      await this.mailer.send({
        to: email,
        resetUrl: resetUrl.toString(),
        expiresInMinutes: 15,
      });
    } catch {
      await this.resets.revoke(token.hash);
    }
    return null;
  }
}
