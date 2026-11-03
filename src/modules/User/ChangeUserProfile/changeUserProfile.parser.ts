import type { RequestContext } from '@/common/context/requestContext.type';

import type { ChangeUserProfileResponseDto } from './changeUserProfile.dto';
import type { UserProfileView } from './changeUserProfile.type';

/** So id, nome e perfil: e-mail, CPF, status e ids internos nao saem. */
export const toChangeUserProfileResponse = (
  user: UserProfileView,
  _ctx: RequestContext,
): ChangeUserProfileResponseDto => ({
  id: user.id,
  name: user.name,
  profile: { code: user.profileCode, name: user.profileName },
});
