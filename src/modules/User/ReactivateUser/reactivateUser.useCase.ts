import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';

import type { UserDto } from '../dtos/user.dto';
import { toUserResponse } from '../parsers/user.parser';
import { toStatusChangeCommand } from '../policies/user.policy';
import { UserRepository } from '../repositories/user.repository';
import { UserErrors } from '../user.errors';

/**
 * Reativacao: volta sempre `active`, ocupa vaga no limite do plano e nao
 * restaura sessoes. Sem senha utilizavel, o admin emite senha temporaria pela
 * redefinicao administrativa.
 */
@Injectable()
export class ReactivateUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string, ctx: RequestContext): Promise<UserDto> {
    const outcome = await this.users.reactivate(
      toStatusChangeCommand(userId, ctx),
    );

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...UserErrors.NOT_FOUND,
          detail: 'Usuário inexistente ou fora da organização.',
        });

      case 'already_active':
        throw new DomainException({
          ...UserErrors.ALREADY_ACTIVE,
          detail: 'Só usuário inativo pode ser reativado.',
        });

      case 'limit_reached':
        throw new DomainException({
          ...UserErrors.PLAN_LIMIT_REACHED,
          detail: 'Usuários pendentes e ativos já ocupam o limite do plano.',
        });

      case 'actor_forbidden':
        throw new DomainException({
          ...AuthErrors.FORBIDDEN,
          detail:
            'O ator deixou de ser administrador ativo antes da reativação.',
        });

      default:
        return toUserResponse(outcome.user, ctx);
    }
  }
}
