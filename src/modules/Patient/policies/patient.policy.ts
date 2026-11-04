import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';

import type { PatientScope } from '../types/patient.types';

/** Perfis que alcancam todos os pacientes da organizacao (decisao de 2026-11-04). */
const ORGANIZATION_WIDE_PROFILES: ReadonlySet<ProfileCode> = new Set([
  ProfileCode.ADMIN,
  ProfileCode.PROFESSIONAL,
]);

/**
 * Admin e profissional veem a organizacao inteira; os demais perfis com
 * `patients:read` (cuidador, familiar) so os pacientes a que estao vinculados.
 */
export const patientScope = (ctx: RequestContext): PatientScope => ({
  organizationId: ctx.organizationId,
  viewerUserId: ORGANIZATION_WIDE_PROFILES.has(ctx.profile) ? null : ctx.userId,
});
