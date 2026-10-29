import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type EnvelopePayload, withMeta } from '@/common/http/envelope';

import {
  PASSWORD_RECOVERY_MAILER,
  type PasswordRecoveryMailer,
} from '../mail/passwordRecoveryMailer';
import { AuthIdentityRepository } from '../repositories/authIdentity.repository';
import { PasswordResetRepository } from '../repositories/passwordReset.repository';
import { AuthRateLimiter } from '../security/authRateLimiter';
import { TokenService } from '../security/token.service';
import type { LoginIdentity } from '../types/auth.types';

const ADMINISTRATOR_MESSAGE =
  'A recuperação por e-mail não está disponível. Procure o administrador da sua organização para receber uma senha temporária.';

const emailMessage = (minutes: number): string =>
  `Se a conta estiver ativa, enviaremos ao e-mail informado um link válido por ${minutes} minutos. Se não receber, procure o administrador da sua organização.`;

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

  /**
   * A resposta e sempre a mesma, exista ou nao a conta; so o canal disponivel
   * muda a orientacao em `meta.message`. Sem SMTP habilitado nao ha token:
   * emitir um link que ninguem consegue receber so criaria credencial viva
   * sem entrega possivel, e o caminho e a redefinicao administrativa.
   */
  async execute(
    input: { organizationCode: string; email: string },
    meta: { ip: string },
  ): Promise<EnvelopePayload<null>> {
    const organizationCode = input.organizationCode.toLowerCase();
    const email = input.email.toLowerCase();

    await this.limiter.assertRecoveryAllowed(organizationCode, email, meta.ip);

    const { identity } = await this.identities.findForAuthentication(
      organizationCode,
      email,
    );

    if (!this.mailer.enabled) {
      return withMeta(null, { message: ADMINISTRATOR_MESSAGE });
    }

    const lifetimeSeconds = this.config.getOrThrow<number>(
      'auth.recoverySeconds',
    );
    const expiresInMinutes = Math.round(lifetimeSeconds / 60);
    const answer = withMeta(null, { message: emailMessage(expiresInMinutes) });

    if (!this.canRecover(identity)) {
      return answer;
    }

    const token = this.tokens.issue();

    await this.resets.create(
      identity.organizationId,
      identity.userId,
      token.hash,
      new Date(Date.now() + lifetimeSeconds * 1000),
    );

    const resetUrl = new URL(
      this.config.getOrThrow<string>('mail.passwordResetUrl'),
    );

    resetUrl.searchParams.set('token', token.raw);

    try {
      await this.mailer.send({
        to: email,
        resetUrl: resetUrl.toString(),
        expiresInMinutes,
      });
    } catch {
      // Sem entrega nao pode sobrar token utilizavel.
      await this.resets.revoke(token.hash);
    }

    return answer;
  }

  private canRecover(
    identity: LoginIdentity | null,
  ): identity is LoginIdentity {
    return (
      identity !== null &&
      identity.status === 'active' &&
      identity.deletedAt === null &&
      identity.organizationStatus === 'active' &&
      identity.organizationDeletedAt === null
    );
  }
}
