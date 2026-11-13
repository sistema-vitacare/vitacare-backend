import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';
import { AuthErrors } from '@/modules/Auth/auth.errors';

import { toUserResponse } from '../parsers/user.parser';
import { UserRepository } from '../repositories/user.repository';
import { InvitationIssuer } from '../services/invitationIssuer.service';
import { UserErrors } from '../user.errors';
import type { CreateUserDto, CreateUserResponseDto } from './createUser.dto';

/**
 * Cadastro do UC03 (passo 3) com o convite do passo 6 (BE-31). Com o canal
 * `email`, o usuario nasce `pending` sem senha e recebe o link depois do
 * commit; com `temporary_password` (SMTP desligado, ou pedido pelo admin), a
 * senha provisoria volta uma unica vez ao administrador. Limite e vigencia do
 * plano bloqueiam antes de qualquer token ou envio.
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly issuer: InvitationIssuer,
  ) {}

  async execute(
    input: CreateUserDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<CreateUserResponseDto>> {
    const issued = await this.issuer.issue(input.channel);
    const actor = {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
    };

    const outcome = await this.users.create({
      ...actor,
      name: input.name,
      email: input.email,
      cpf: input.cpf,
      phone: input.phone ?? null,
      profileCode: input.profileCode,
      invitation: issued.invitation,
    });

    switch (outcome.kind) {
      case 'plan_expired':
        throw new DomainException({
          ...UserErrors.PLAN_EXPIRED,
          detail: 'O termo corrente do plano da organização está vencido.',
        });

      case 'limit_reached':
        throw new DomainException({
          ...UserErrors.PLAN_LIMIT_REACHED,
          detail: 'Usuários pendentes e ativos já ocupam o limite do plano.',
        });

      case 'actor_forbidden':
        throw new DomainException({
          ...AuthErrors.FORBIDDEN,
          detail: 'O ator deixou de ser administrador ativo antes do cadastro.',
        });

      default: {
        const { response, message } = await this.issuer.complete(
          issued,
          outcome.mail,
          actor,
        );
        // Releitura depois do envio: `invitation` sai com `sentAt` ou `invalidated`.
        const user =
          outcome.mail === null
            ? outcome.user
            : ((await this.users.findById(
                ctx.organizationId,
                outcome.user.id,
              )) ?? outcome.user);

        return withMeta(
          { user: toUserResponse(user, ctx), ...response },
          message ? { message } : {},
        );
      }
    }
  }
}
