import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PlanChangeRequestDto } from '../dtos/plan.dto';
import { toPlanChangeRequestResponse } from '../parsers/plan.parser';
import { PlanErrors } from '../plan.errors';
import type { DecideRequestOutcome } from '../repositories/plan.repository';

/** Resultado comum de cancelar, aprovar e recusar. */
export const toDecidedRequest = (
  outcome: DecideRequestOutcome,
  ctx: RequestContext,
): PlanChangeRequestDto => {
  switch (outcome.kind) {
    case 'not_found':
      throw new DomainException({
        ...PlanErrors.REQUEST_NOT_FOUND,
        detail: 'Solicitação inexistente ou fora do alcance da sessão.',
      });

    case 'not_pending':
      throw new DomainException({
        ...PlanErrors.REQUEST_NOT_PENDING,
        detail: 'Só solicitação pendente pode ser decidida ou cancelada.',
      });

    case 'plan_not_found':
      throw new DomainException({
        ...PlanErrors.NOT_FOUND,
        detail: 'O plano solicitado saiu do catálogo depois do pedido.',
      });

    default:
      return toPlanChangeRequestResponse(outcome.request, ctx);
  }
};
