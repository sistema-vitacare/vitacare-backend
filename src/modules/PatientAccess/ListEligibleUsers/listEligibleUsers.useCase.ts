import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';

import type { EligibleUserDto } from '../dtos/patientLink.dto';
import { toEligibleUserResponse } from '../parsers/patientLink.parser';
import { PatientLinkRepository } from '../repositories/patientLink.repository';
import type { ListEligibleUsersQueryDto } from './listEligibleUsers.dto';

/**
 * Seletor de usuarios para vinculos e responsavel, para quem nao tem
 * `users:read` (profissional): so id, nome, perfil e status.
 */
@Injectable()
export class ListEligibleUsersUseCase {
  constructor(private readonly links: PatientLinkRepository) {}

  async execute(
    query: ListEligibleUsersQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<EligibleUserDto[]>> {
    const [items, total] = await this.links.listEligibleUsers(
      ctx.organizationId,
      {
        role: query.role,
        search: query.search,
        skip: query.skip,
        take: query.limit,
      },
    );

    return paginate(items.map(toEligibleUserResponse), total, query);
  }
}
