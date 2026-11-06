import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';

/**
 * O familiar ve so registros validos (BE-19, decisao de 2026-11-06): para ele,
 * o anulado e seus anexos se comportam como inexistentes.
 */
export const readsAnnulledFollowUps = (ctx: RequestContext): boolean =>
  ctx.profile !== ProfileCode.FAMILY;
