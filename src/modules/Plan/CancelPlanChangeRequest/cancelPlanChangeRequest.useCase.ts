import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import type { PlanChangeRequestDto } from '../dtos/plan.dto';
import { toPlanActor } from '../parsers/plan.parser';
import { toDecidedRequest } from '../policies/planChangeRequest.policy';
import { PlanRepository } from '../repositories/plan.repository';

/** O administrador desiste do pedido pendente da propria organizacao. */
@Injectable()
export class CancelPlanChangeRequestUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(
    requestId: string,
    ctx: RequestContext,
  ): Promise<PlanChangeRequestDto> {
    return toDecidedRequest(
      await this.plans.cancelRequest(
        ctx.organizationId,
        requestId,
        toPlanActor(ctx),
      ),
      ctx,
    );
  }
}
