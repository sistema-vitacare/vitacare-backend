import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { OrganizationErrors } from '@/modules/Organization/organization.errors';
import { canReachOrganization } from '@/modules/Organization/policies/organization.policy';

import type { OrganizationPlanDto } from '../dtos/plan.dto';
import { toOrganizationPlanResponse } from '../parsers/plan.parser';
import { PlanRepository } from '../repositories/plan.repository';

/** Plano, vigencia, limites efetivos, uso e pedido pendente (UC04 passos 1-3). */
@Injectable()
export class GetOrganizationPlanUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(
    organizationId: string,
    ctx: RequestContext,
  ): Promise<OrganizationPlanDto> {
    const row = canReachOrganization(ctx, organizationId)
      ? await this.plans.findOrganizationPlan(organizationId)
      : null;

    if (!row) {
      throw new DomainException({
        ...OrganizationErrors.NOT_FOUND,
        detail: 'Organização cliente inexistente ou fora do alcance da sessão.',
      });
    }

    const [[pending]] = await this.plans.listRequests({
      organizationId,
      status: 'pending',
      skip: 0,
      take: 1,
    });

    return toOrganizationPlanResponse(row, pending ?? null, ctx);
  }
}
