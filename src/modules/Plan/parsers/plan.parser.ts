import type { RequestContext } from '@/common/context/requestContext.type';
import { isPlatformContext } from '@/modules/Organization/policies/organization.policy';

import type {
  OrganizationPlanDto,
  PlanChangeRequestDto,
  PlanDto,
} from '../dtos/plan.dto';
import type { UsagePlan } from '../entities/usagePlan.entity';
import type {
  OrganizationPlanRow,
  PlanActor,
  PlanChangeRequestRow,
} from '../types/plan.types';

export const toPlanResponse = (
  plan: Pick<
    UsagePlan,
    | 'id'
    | 'code'
    | 'name'
    | 'description'
    | 'userLimit'
    | 'patientLimit'
    | 'features'
    | 'monthlyPrice'
  >,
): PlanDto => ({
  id: plan.id,
  code: plan.code,
  name: plan.name,
  description: plan.description,
  userLimit: plan.userLimit,
  patientLimit: plan.patientLimit,
  features: plan.features,
  monthlyPrice: plan.monthlyPrice,
});

/** Quem decidiu fora do tenant e usuario da plataforma: so ela o ve. */
export const toPlanChangeRequestResponse = (
  request: PlanChangeRequestRow,
  ctx: RequestContext,
): PlanChangeRequestDto => ({
  id: request.id,
  organizationId: request.organizationId,
  currentPlan: request.currentPlan,
  requestedPlan: request.requestedPlan,
  notes: request.notes,
  status: request.status,
  requestedByUserId: request.requestedByUserId,
  decidedByUserId: isPlatformContext(ctx) ? request.decidedByUserId : null,
  decidedAt: request.decidedAt
    ? new Date(request.decidedAt).toISOString()
    : null,
  decisionNote: request.decisionNote,
  createdAt: new Date(request.createdAt).toISOString(),
});

export const toOrganizationPlanResponse = (
  row: OrganizationPlanRow,
  pending: PlanChangeRequestRow | null,
  ctx: RequestContext,
): OrganizationPlanDto => ({
  organizationId: row.organizationId,
  plan: toPlanResponse(row.plan),
  term: {
    id: row.term.id,
    startsAt: row.term.startsAt.toISOString(),
    endsAt: row.term.endsAt?.toISOString() ?? null,
    status: row.term.expired ? 'expired' : 'active',
    origin: row.term.origin,
    userLimit: row.term.userLimit,
    patientLimit: row.term.patientLimit,
  },
  limits: {
    users: row.term.userLimit ?? row.plan.userLimit,
    patients: row.term.patientLimit ?? row.plan.patientLimit,
  },
  usage: { users: row.usage.users, patients: null },
  pendingChangeRequest: pending
    ? toPlanChangeRequestResponse(pending, ctx)
    : null,
});

export const toPlanActor = (ctx: RequestContext): PlanActor => ({
  userId: ctx.userId,
  organizationId: ctx.organizationId,
  requestId: ctx.requestId,
});
