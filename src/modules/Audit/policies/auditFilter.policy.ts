import type { RequestContext } from '@/common/context/requestContext.type';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';
import { isPlatformContext } from '@/modules/Organization/policies/organization.policy';

import type { AuditEventFilterQueryDto } from '../dtos/auditEvent.dto';
import type { AuditEventFilter } from '../types/auditEvent.types';
import { actionsMatching } from './auditCatalog.policy';

/**
 * Filtro da consulta e da exportacao: periodo do BE-20 sobre `occurred_at`;
 * o master ve todas as organizacoes (ou a escolhida), o admin so a da sessao.
 */
export const resolveAuditFilter = (
  query: AuditEventFilterQueryDto,
  ctx: RequestContext,
  today: string,
): AuditEventFilter => {
  const term = query.search?.trim();

  return {
    organizationId: isPlatformContext(ctx)
      ? (query.organizationId ?? null)
      : ctx.organizationId,
    viewerOrganizationId: ctx.organizationId,
    period: resolveEvolutionPeriod(query, today),
    action: query.action || undefined,
    severity: query.severity,
    actorUserId: query.actorUserId,
    actorType: query.actorType,
    search: term ? { term, actions: actionsMatching(term) } : undefined,
  };
};
