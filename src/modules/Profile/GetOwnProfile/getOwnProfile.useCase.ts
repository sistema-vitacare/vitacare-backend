import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import type { SessionProfileDto } from '@/modules/Auth/dtos/sessionProfile.dto';
import { toSessionProfileResponse } from '@/modules/Auth/parsers/sessionProfile.parser';
import { AuthIdentityRepository } from '@/modules/Auth/repositories/authIdentity.repository';

/**
 * O proprio cadastro (BE-27): o bloco de sessao do login, com o CPF completo,
 * porque e dado do proprio titular. O alvo vem so da sessao.
 */
@Injectable()
export class GetOwnProfileUseCase {
  constructor(private readonly identities: AuthIdentityRepository) {}

  async execute(ctx: RequestContext): Promise<SessionProfileDto> {
    const row = await this.identities.findSessionProfile(
      ctx.userId,
      ctx.organizationId,
    );

    if (!row) {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Usuário da sessão não encontrado.',
      });
    }

    return toSessionProfileResponse(row, { cpf: 'full', restricted: false });
  }
}
