import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';

import {
  CAREGIVER_NO_LINK_MESSAGE,
  FAMILY_NO_LINK_MESSAGE,
  type PatientLinkRole,
  type PatientScope,
} from '../types/patient.types';

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

/**
 * O familiar le o recorte da Figura 37 (BE-19, decisao de 2026-11-06): sem
 * CPF, contato, endereco, plano de saude e observacoes.
 */
export const readsFullPatientRecord = (ctx: RequestContext): boolean =>
  ctx.profile !== ProfileCode.FAMILY;

/**
 * Orientacao para quem so ve pacientes vinculados e nao tem vinculo vigente
 * nenhum (UC14 alternativo; BE-29, decisao de Mateus em 2026-11-12): a lista
 * continua `200` vazia, com a mensagem no lugar do "acesso negado" do TCC.
 */
const NO_LINK_MESSAGES: Partial<Record<ProfileCode, string>> = {
  [ProfileCode.CAREGIVER]: CAREGIVER_NO_LINK_MESSAGE,
  [ProfileCode.FAMILY]: FAMILY_NO_LINK_MESSAGE,
};

export const noCareLinkMessage = (ctx: RequestContext): string | null =>
  NO_LINK_MESSAGES[ctx.profile] ?? null;
