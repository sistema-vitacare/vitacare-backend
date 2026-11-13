import { Injectable } from '@nestjs/common';

import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';

import { AuthErrors } from '../auth.errors';
import { UserInvitationRepository } from '../repositories/userInvitation.repository';
import { AuthRateLimiter } from '../security/authRateLimiter';
import { PasswordHasher } from '../security/passwordHasher';
import { TokenService } from '../security/token.service';
import type { AcceptedInvitationDto } from './acceptInvitation.dto';

export const INVITATION_ACCEPTED_MESSAGE =
  'Senha cadastrada. Entre com seu e-mail e a nova senha.';

/**
 * Aceite do convite por link (BE-31): grava a senha escolhida pelo proprio
 * usuario, ativa a conta e consome o token, numa transacao. Nao abre sessao
 * (decisao de Mateus, 2026-11-13): o usuario entra pelo login.
 */
@Injectable()
export class AcceptInvitationUseCase {
  constructor(
    private readonly limiter: AuthRateLimiter,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordHasher,
    private readonly invitations: UserInvitationRepository,
  ) {}

  async execute(
    input: { token: string; newPassword: string },
    meta: { ip: string; requestId: string | null },
  ): Promise<EnvelopePayload<AcceptedInvitationDto>> {
    await this.limiter.assertInvitationAllowed(meta.ip);

    const accepted = await this.invitations.accept(
      this.tokens.hash(input.token),
      await this.passwords.hash(input.newPassword),
      meta.requestId,
    );

    if (!accepted) {
      throw new DomainException({
        ...AuthErrors.INVITATION_INVALID_OR_EXPIRED,
        detail: 'Convite inexistente, vencido, consumido ou revogado.',
      });
    }

    return withMeta(accepted, { message: INVITATION_ACCEPTED_MESSAGE });
  }
}
