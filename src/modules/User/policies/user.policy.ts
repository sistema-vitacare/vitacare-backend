import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { TargetUserCommand } from '../types/user.types';
import { UserErrors } from '../user.errors';

/**
 * Inativacao e reativacao nunca atingem a propria conta. O `ParseUUIDPipe`
 * aceita maiusculas, entao a comparacao as ignora.
 */
export const toStatusChangeCommand = (
  userId: string,
  ctx: RequestContext,
): TargetUserCommand => {
  const targetUserId = userId.toLowerCase();

  if (targetUserId === ctx.userId.toLowerCase()) {
    throw new DomainException({
      ...UserErrors.SELF_STATUS_CHANGE,
      detail: 'A mudança de status não pode atingir a própria conta.',
    });
  }

  return {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    requestId: ctx.requestId,
    targetUserId,
  };
};
