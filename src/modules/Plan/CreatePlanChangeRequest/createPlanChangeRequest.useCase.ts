import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PlanChangeRequestDto } from '../dtos/plan.dto';
import {
  toPlanActor,
  toPlanChangeRequestResponse,
} from '../parsers/plan.parser';
import { PlanErrors } from '../plan.errors';
import { PlanRepository } from '../repositories/plan.repository';
import type { CreatePlanChangeRequestDto } from './createPlanChangeRequest.dto';

/** UC04 passos 4-5: registra o pedido; o plano so muda na aprovacao. */
@Injectable()
export class CreatePlanChangeRequestUseCase {
  constructor(private readonly plans: PlanRepository) {}

  async execute(
    input: CreatePlanChangeRequestDto,
    ctx: RequestContext,
  ): Promise<PlanChangeRequestDto> {
    const outcome = await this.plans.createRequest(
      ctx.organizationId,
      input.requestedPlanId,
      input.notes ?? null,
      toPlanActor(ctx),
    );

    switch (outcome.kind) {
      case 'plan_not_found':
        throw new DomainException({
          ...PlanErrors.NOT_FOUND,
          detail: 'Plano inexistente, inativo ou excluído.',
          fields: [{ field: 'requestedPlanId', code: 'NOT_FOUND' }],
        });

      case 'same_plan':
        throw new DomainException({
          ...PlanErrors.SAME_PLAN,
          detail: 'Plano pedido igual ao corrente com vigência não vencida.',
          fields: [{ field: 'requestedPlanId', code: 'SAME_PLAN' }],
        });

      case 'already_pending':
        throw new DomainException({
          ...PlanErrors.REQUEST_ALREADY_PENDING,
          detail: 'A organização já tem uma solicitação pendente.',
        });

      default:
        return toPlanChangeRequestResponse(outcome.request, ctx);
    }
  }
}
