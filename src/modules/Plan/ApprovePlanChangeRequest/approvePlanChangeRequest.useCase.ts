import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { assertPlatformContext } from '@/modules/Organization/policies/organization.policy';

import type { PlanChangeRequestDto } from '../dtos/plan.dto';
import { toPlanActor } from '../parsers/plan.parser';
import { toDecidedRequest } from '../policies/planChangeRequest.policy';
import { toPlanTermInput } from '../policies/planTerm.policy';
import { PlanRepository } from '../repositories/plan.repository';
import type { ApprovePlanChangeRequestDto } from './approvePlanChangeRequest.dto';

/** O master aprova: o plano pedido passa a valer num termo novo. */
@Injectable()
export class ApprovePlanChangeRequestUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(
    requestId: string,
    input: ApprovePlanChangeRequestDto,
    ctx: RequestContext,
  ): Promise<PlanChangeRequestDto> {
    assertPlatformContext(ctx);

    return toDecidedRequest(
      await this.plans.approveRequest({
        requestId,
        term: toPlanTermInput(input),
        decisionNote: input.decisionNote ?? null,
        actor: toPlanActor(ctx),
      }),
      ctx,
    );
  }
}
