import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { UserDto } from '../dtos/user.dto';
import { toUserResponse } from '../parsers/user.parser';
import { UserRepository } from '../repositories/user.repository';
import { UserErrors } from '../user.errors';

@Injectable()
export class GetUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string, ctx: RequestContext): Promise<UserDto> {
    const user = await this.users.findById(ctx.organizationId, userId);

    if (!user) {
      throw new DomainException({
        ...UserErrors.NOT_FOUND,
        detail: 'Usuário inexistente ou fora da organização.',
      });
    }

    return toUserResponse(user, ctx);
  }
}
