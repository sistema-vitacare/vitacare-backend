import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';
import { isPlatformContext } from '@/modules/Organization/policies/organization.policy';

import type { PlanChangeRequestDto } from '../dtos/plan.dto';
import { toPlanChangeRequestResponse } from '../parsers/plan.parser';
import { PlanRepository } from '../repositories/plan.repository';
import type { ListPlanChangeRequestsQueryDto } from './listPlanChangeRequests.dto';

/** Tenant ve as proprias; a plataforma ve todas, com filtro opcional. */
@Injectable()
export class ListPlanChangeRequestsUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(
    query: ListPlanChangeRequestsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<PlanChangeRequestDto[]>> {
    const [items, total] = await this.plans.listRequests({
      organizationId: isPlatformContext(ctx)
        ? query.organizationId
        : ctx.organizationId,
      status: query.status,
      skip: query.skip,
      take: query.limit,
    });

    return paginate(
      items.map((item) => toPlanChangeRequestResponse(item, ctx)),
      total,
      query,
    );
  }
}
