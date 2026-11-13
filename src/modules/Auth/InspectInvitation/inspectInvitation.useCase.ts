import { Injectable } from '@nestjs/common';

import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import { UserInvitationRepository } from '../repositories/userInvitation.repository';
import { AuthRateLimiter } from '../security/authRateLimiter';
import { TokenService } from '../security/token.service';
import type { InvitationPreviewDto } from './inspectInvitation.dto';

/**
 * Le o convite sem consumi-lo (BE-31), para a pagina de aceite mostrar quem
 * convida e para qual perfil. Inexistente, vencido, consumido, revogado,
 * usuario fora de `pending` ou organizacao inativa respondem igual.
 */
@Injectable()
export class InspectInvitationUseCase {
  constructor(
    private readonly limiter: AuthRateLimiter,
    private readonly tokens: TokenService,
    private readonly invitations: UserInvitationRepository,
  ) {}

  async execute(
    input: { token: string },
    meta: { ip: string },
  ): Promise<InvitationPreviewDto> {
    await this.limiter.assertInvitationAllowed(meta.ip);

    const row = await this.invitations.inspect(this.tokens.hash(input.token));

    if (!row) {
      throw new DomainException({
        ...AuthErrors.INVITATION_INVALID_OR_EXPIRED,
        detail: 'Convite inexistente, vencido, consumido ou revogado.',
      });
    }

    return {
      user: { name: row.userName, email: row.email },
      organization: { code: row.organizationCode, name: row.organizationName },
      profile: { code: row.profileCode, name: row.profileName },
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}
