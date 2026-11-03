import type { RequestContext } from '@/common/context/requestContext.type';

import type { AccessProfileRecord } from '../repositories/accessProfile.repository';
import type { AccessProfileDto } from './listAccessProfiles.dto';

/** Copia campo a campo: nenhum id interno de perfil ou concessao sai pela API. */
export const toAccessProfileResponse = (
  profile: AccessProfileRecord,
  _ctx: RequestContext,
): AccessProfileDto => ({
  code: profile.code,
  name: profile.name,
  description: profile.description,
  permissions: profile.permissions.map((permission) => ({
    code: permission.code,
    name: permission.name,
  })),
});
