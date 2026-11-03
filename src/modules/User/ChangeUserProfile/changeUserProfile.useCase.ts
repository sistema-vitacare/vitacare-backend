import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
import { AuthErrors } from '@/modules/Auth/auth.errors';

import { UserRepository } from '../repositories/user.repository';
import { UserErrors } from '../user.errors';
import type { ChangeUserProfileResponseDto } from './changeUserProfile.dto';
import { toChangeUserProfileResponse } from './changeUserProfile.parser';

/**
 * Troca o perfil de outro usuario da organizacao da sessao (BE-05, RF005/RF016,
 * UC03 passos 3-4). O ator nunca atinge a propria conta e e relido sob a trava
 * da organizacao, entao sempre resta um admin ativo. Sessoes do alvo nao sao
 * revogadas: o perfil e relido a cada requisicao.
 */
@Injectable()
export class ChangeUserProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(
    input: { userId: string; profileCode: TenantProfileCode },
    ctx: RequestContext,
  ): Promise<ChangeUserProfileResponseDto> {
    // O ParseUUIDPipe aceita maiusculas; a comparacao precisa ignora-las.
    const targetUserId = input.userId.toLowerCase();

    if (targetUserId === ctx.userId.toLowerCase()) {
      throw new DomainException({
        ...UserErrors.SELF_PROFILE_CHANGE,
        detail: 'A troca de perfil não pode atingir a própria conta.',
      });
    }

    const outcome = await this.users.changeProfile({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      targetUserId,
      profileCode: input.profileCode,
      requestId: ctx.requestId,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...UserErrors.NOT_FOUND,
          detail: 'Usuário inexistente ou fora da organização.',
        });

      case 'actor_forbidden':
        throw new DomainException({
          ...AuthErrors.FORBIDDEN,
          detail: 'O ator deixou de ser administrador ativo antes da troca.',
        });

      default:
        return toChangeUserProfileResponse(outcome.user, ctx);
    }
  }
}
