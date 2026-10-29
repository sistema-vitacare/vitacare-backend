import type { RequestContext } from '@/common/context/requestContext.type';

import type { OrganizationDto } from '../dtos/organization.dto';
import type { Organization } from '../entities/organization.entity';
import type { OrganizationActor } from '../types/organization.types';
import { isPlatformContext } from '../policies/organization.policy';

export const toOrganizationResponse = (
  organization: Organization,
  ctx: RequestContext,
): OrganizationDto => ({
  id: organization.id,
  code: organization.code,
  ...(isPlatformContext(ctx) ? { kind: organization.kind } : {}),
  tradeName: organization.tradeName,
  legalName: organization.legalName,
  document: organization.document,
  phone: organization.phone,
  email: organization.email,
  status: organization.status,
  usagePlanId: organization.usagePlanId,
  createdAt: organization.createdAt.toISOString(),
  updatedAt: organization.updatedAt.toISOString(),
  deletedAt: organization.deletedAt?.toISOString() ?? null,
});

export const toOrganizationActor = (
  ctx: RequestContext,
): OrganizationActor => ({
  userId: ctx.userId,
  organizationId: ctx.organizationId,
  requestId: ctx.requestId,
});
