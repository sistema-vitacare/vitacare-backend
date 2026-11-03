import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { UserDto } from '../dtos/user.dto';
import { toUserResponse } from '../parsers/user.parser';
import { UserRepository } from '../repositories/user.repository';
import type { UserPatch } from '../types/user.types';
import { UserErrors } from '../user.errors';
import type { UpdateUserDto } from './updateUser.dto';

/**
 * Edicao dos dados cadastrais de um usuario do tenant, inclusive do proprio
 * admin. Trocar o e-mail nao derruba sessoes: elas sao do token, nao do e-mail.
 */
@Injectable()
export class UpdateUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(
    userId: string,
    input: UpdateUserDto,
    ctx: RequestContext,
  ): Promise<UserDto> {
    const patch: UserPatch = Object.fromEntries(
      (['name', 'email', 'cpf', 'phone'] as const)
        .filter((field) => input[field] !== undefined)
        .map((field) => [field, input[field]]),
    );

    if (Object.keys(patch).length === 0) {
      throw new DomainException({
        ...UserErrors.NOTHING_TO_UPDATE,
        detail: 'Corpo sem nenhum campo editável.',
      });
    }

    const outcome = await this.users.update({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      targetUserId: userId,
      patch,
    });

    if (outcome.kind === 'not_found') {
      throw new DomainException({
        ...UserErrors.NOT_FOUND,
        detail: 'Usuário inexistente ou fora da organização.',
      });
    }

    return toUserResponse(outcome.user, ctx);
  }
}
