import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';

import type { PatientLinkRole, PatientScope } from '../types/patient.types';

/** Perfis que alcancam todos os pacientes da organizacao (decisao de 2026-11-04). */
const ORGANIZATION_WIDE_PROFILES: ReadonlySet<ProfileCode> = new Set([
  ProfileCode.ADMIN,
  ProfileCode.PROFESSIONAL,
]);

/**
 * Papel de vinculo que da leitura a cada perfil restrito. O vinculo de
 * responsavel nao conta: um profissional rebaixado a cuidador ou familiar nao
 * herda os pacientes de que era responsavel.
 */
const LINK_ROLES_BY_PROFILE: Partial<
  Record<ProfileCode, readonly PatientLinkRole[]>
> = {
  [ProfileCode.CAREGIVER]: ['caregiver'],
  [ProfileCode.FAMILY]: ['family'],
};

/**
 * Admin e profissional veem a organizacao inteira; os demais perfis com
 * `patients:read` (cuidador, familiar) so os pacientes a que estao vinculados.
 */
export const patientScope = (ctx: RequestContext): PatientScope =>
  ORGANIZATION_WIDE_PROFILES.has(ctx.profile)
    ? {
        organizationId: ctx.organizationId,
        viewerUserId: null,
        viewerLinkRoles: [],
      }
    : {
        organizationId: ctx.organizationId,
        viewerUserId: ctx.userId,
        viewerLinkRoles: LINK_ROLES_BY_PROFILE[ctx.profile] ?? [],
      };
