import type { RequestContext } from '@/common/context/requestContext.type';

import type { EligibleUserDto, PatientLinkDto } from '../dtos/patientLink.dto';
import type { UpdatePatientLinkDto } from '../UpdatePatientLink/updatePatientLink.dto';
import type {
  EligibleUserRow,
  PatientLinkPatch,
  PatientLinkRow,
} from '../types/patientAccess.types';

/** Corpo de edicao -> so o que veio; `null` limpa. */
export const toPatientLinkPatch = (
  input: UpdatePatientLinkDto,
): PatientLinkPatch => ({
  ...(input.linkType !== undefined && { linkType: input.linkType }),
  ...(input.note !== undefined && { note: input.note }),
});

export const toPatientLinkResponse = (
  link: PatientLinkRow,
  _ctx: RequestContext,
): PatientLinkDto => ({
  id: link.id,
  patient: {
    id: link.patientId,
    name: link.patientName,
    status: link.patientStatus,
  },
  user: {
    id: link.userId,
    name: link.userName,
    profile: link.userProfile,
    status: link.userStatus,
  },
  role: link.role,
  linkType: link.linkType,
  note: link.note,
  status: link.deletedAt ? 'revoked' : 'active',
  createdAt: link.createdAt.toISOString(),
  updatedAt: link.updatedAt.toISOString(),
  revokedAt: link.deletedAt?.toISOString() ?? null,
});

export const toEligibleUserResponse = (
  user: EligibleUserRow,
): EligibleUserDto => ({
  id: user.id,
  name: user.name,
  profile: user.profile,
  status: user.status,
});
