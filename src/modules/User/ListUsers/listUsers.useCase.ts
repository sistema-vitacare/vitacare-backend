import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';

import type { UserDto } from '../dtos/user.dto';
import { toUserResponse } from '../parsers/user.parser';
import { UserRepository } from '../repositories/user.repository';
import type { ListUsersQueryDto } from './listUsers.dto';

/** Lista os usuarios da organizacao da sessao (UC03); CPF sai mascarado. */
@Injectable()
export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(
    query: ListUsersQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<UserDto[]>> {
    const [items, total] = await this.users.list(ctx.organizationId, {
      status: query.status,
      profileCode: query.profileCode,
      search: query.search,
      skip: query.skip,
      take: query.limit,
    });

    return paginate(
      items.map((item) => toUserResponse(item, ctx, { maskCpf: true })),
      total,
      query,
    );
  }
}
