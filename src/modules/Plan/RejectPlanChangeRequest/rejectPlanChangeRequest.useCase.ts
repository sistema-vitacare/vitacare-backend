import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { assertPlatformContext } from '@/modules/Organization/policies/organization.policy';

import type { PlanChangeRequestDto } from '../dtos/plan.dto';
import { toPlanActor } from '../parsers/plan.parser';
import { toDecidedRequest } from '../policies/planChangeRequest.policy';
import { PlanRepository } from '../repositories/plan.repository';
import type { RejectPlanChangeRequestDto } from './rejectPlanChangeRequest.dto';

/** O master recusa com justificativa; o plano corrente segue intacto. */
@Injectable()
export class RejectPlanChangeRequestUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(
    requestId: string,
    input: RejectPlanChangeRequestDto,
    ctx: RequestContext,
  ): Promise<PlanChangeRequestDto> {
    assertPlatformContext(ctx);

    return toDecidedRequest(
      await this.plans.rejectRequest(
        requestId,
        input.decisionNote,
        toPlanActor(ctx),
      ),
      ctx,
    );
  }
}
