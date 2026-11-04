import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { OrganizationErrors } from '@/modules/Organization/organization.errors';
import { assertPlatformContext } from '@/modules/Organization/policies/organization.policy';

import type { OrganizationPlanDto } from '../dtos/plan.dto';
import {
  toOrganizationPlanResponse,
  toPlanActor,
} from '../parsers/plan.parser';
import { PlanErrors } from '../plan.errors';
import { toPlanTermInput } from '../policies/planTerm.policy';
import { PlanRepository } from '../repositories/plan.repository';
import type { AssignOrganizationPlanDto } from './assignOrganizationPlan.dto';

/**
 * Atribuicao, troca, renovacao ou personalizacao pelo master: encerra o termo
 * corrente e abre outro. Nao decide a solicitacao pendente, se houver.
 */
@Injectable()
export class AssignOrganizationPlanUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(
    organizationId: string,
    input: AssignOrganizationPlanDto,
    ctx: RequestContext,
  ): Promise<OrganizationPlanDto> {
    assertPlatformContext(ctx);

    const outcome = await this.plans.assign(
      organizationId,
      input.planId,
      toPlanTermInput(input),
      input.reason ?? null,
      toPlanActor(ctx),
    );

    switch (outcome.kind) {
      case 'organization_not_found':
        throw new DomainException({
          ...OrganizationErrors.NOT_FOUND,
          detail: 'Organização cliente inexistente.',
        });

      case 'plan_not_found':
        throw new DomainException({
          ...PlanErrors.NOT_FOUND,
          detail: 'Plano inexistente, inativo ou excluído.',
          fields: [{ field: 'planId', code: 'NOT_FOUND' }],
        });

      default: {
        const [[pending]] = await this.plans.listRequests({
          organizationId,
          status: 'pending',
          skip: 0,
          take: 1,
        });

        return toOrganizationPlanResponse(outcome.plan, pending ?? null, ctx);
      }
    }
  }
}
