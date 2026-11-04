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
 * Papeis de vinculo que dao leitura aos demais perfis. O vinculo de
 * responsavel nao conta: um profissional rebaixado a cuidador ou familiar nao
 * herda os pacientes de que era responsavel. O BE-10 cria os papeis destes
 * perfis; ate la eles nao alcancam nenhum paciente.
 */
const LINK_ROLES_BY_PROFILE: Partial<
  Record<ProfileCode, readonly PatientLinkRole[]>
> = {};

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
