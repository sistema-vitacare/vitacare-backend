import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';

export const isPlatformContext = (ctx: RequestContext): boolean =>
  ctx.organizationKind === 'platform';

/** Fora da plataforma, so a propria organizacao existe para o chamador. */
export const canReachOrganization = (
  ctx: RequestContext,
  organizationId: string,
): boolean => isPlatformContext(ctx) || ctx.organizationId === organizationId;

export const assertPlatformContext = (ctx: RequestContext): void => {
  if (!isPlatformContext(ctx)) {
    throw new DomainException({
      ...AuthErrors.FORBIDDEN,
      detail: 'Operação restrita à administração da plataforma.',
    });
  }
};
