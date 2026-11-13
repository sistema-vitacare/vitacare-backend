import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';
import { AuthErrors } from '@/modules/Auth/auth.errors';

import type { UserInvitationResponseDto } from '../dtos/user.dto';
import { UserRepository } from '../repositories/user.repository';
import { InvitationIssuer } from '../services/invitationIssuer.service';
import type { InvitationChannel } from '../types/user.types';
import { UserErrors } from '../user.errors';

/**
 * Reenvio do convite: so para quem ainda esta `pending`, vencido ou nao. Cada
 * emissao invalida a anterior (senha provisoria ou link) antes do envio e pode
 * trocar o canal (BE-31).
 */
@Injectable()
export class ReissueUserInvitationUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly issuer: InvitationIssuer,
  ) {}

  async execute(
    userId: string,
    channel: InvitationChannel | undefined,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<UserInvitationResponseDto>> {
    const issued = await this.issuer.issue(channel);
    const actor = {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
    };

    const outcome = await this.users.reissueInvitation({
      ...actor,
      targetUserId: userId,
      invitation: issued.invitation,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...UserErrors.NOT_FOUND,
          detail: 'Usuário inexistente ou fora da organização.',
        });

      case 'already_accepted':
        throw new DomainException({
          ...UserErrors.INVITATION_ALREADY_ACCEPTED,
          detail: 'O convite já foi aceito no primeiro acesso.',
        });

      case 'inactive':
        throw new DomainException({
          ...UserErrors.INACTIVE,
          detail: 'Convite não é reemitido para usuário inativo.',
        });

      case 'actor_forbidden':
        throw new DomainException({
          ...AuthErrors.FORBIDDEN,
          detail: 'O ator deixou de ser administrador ativo antes do reenvio.',
        });

      default: {
        const { response, message } = await this.issuer.complete(
          issued,
          outcome.mail,
          actor,
        );

        return withMeta(response, message ? { message } : {});
      }
    }
  }
}
