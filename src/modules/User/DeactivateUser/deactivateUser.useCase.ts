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
 * Inativacao do UC03 (fluxo alternativo): revoga o acesso na hora e preserva
 * historico e autoria. A confirmacao pedida pelo UC fica com a interface.
 */
@Injectable()
export class DeactivateUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string, ctx: RequestContext): Promise<UserDto> {
    const outcome = await this.users.deactivate(
      toStatusChangeCommand(userId, ctx),
    );

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...UserErrors.NOT_FOUND,
          detail: 'Usuário inexistente ou fora da organização.',
        });

      case 'already_inactive':
        throw new DomainException({
          ...UserErrors.ALREADY_INACTIVE,
          detail: 'O usuário já estava inativo.',
        });

      case 'actor_forbidden':
        throw new DomainException({
          ...AuthErrors.FORBIDDEN,
          detail:
            'O ator deixou de ser administrador ativo antes da inativação.',
        });

      default:
        return toUserResponse(outcome.user, ctx);
    }
  }
}
