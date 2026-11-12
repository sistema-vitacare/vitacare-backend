import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';
import { OrganizationErrors } from '@/modules/Organization/organization.errors';
import { canReachOrganization } from '@/modules/Organization/policies/organization.policy';

import type { OrganizationPlanDto } from '../dtos/plan.dto';
import { toOrganizationPlanResponse } from '../parsers/plan.parser';
import { planExpiryWarningMessage } from '../policies/planExpiry.policy';
import { PlanRepository } from '../repositories/plan.repository';

/**
 * Plano, vigencia, limites efetivos, uso e pedido pendente (UC04 passos 1-3).
 * Com aviso de vencimento, `meta.message` o explica (UC04 alternativo, BE-28).
 */
@Injectable()
export class GetOrganizationPlanUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(
    organizationId: string,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<OrganizationPlanDto>> {
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

    const plan = toOrganizationPlanResponse(row, pending ?? null, ctx);
    const message = planExpiryWarningMessage(
      plan.term.expiryWarning,
      row.term.endsAt,
    );

    return withMeta(plan, message ? { message } : {});
  }
}
