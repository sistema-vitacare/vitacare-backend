import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';

import type { OrganizationDto } from '../dtos/organization.dto';
import { toOrganizationResponse } from '../parsers/organization.parser';
import { assertPlatformContext } from '../policies/organization.policy';
import { OrganizationRepository } from '../repositories/organization.repository';
import type { ListOrganizationsQueryDto } from './listOrganizations.dto';

@Injectable()
export class ListOrganizationsUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(
    query: ListOrganizationsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<OrganizationDto[]>> {
    assertPlatformContext(ctx);

    const [items, total] = await this.organizations.list({
      status: query.status,
      search: query.search,
      skip: query.skip,
      take: query.limit,
    });

    return paginate(
      items.map((item) => toOrganizationResponse(item, ctx)),
      total,
      query,
    );
  }
}
