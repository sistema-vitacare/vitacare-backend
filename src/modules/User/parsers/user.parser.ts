import type { RequestContext } from '@/common/context/requestContext.type';

import type { UserDto } from '../dtos/user.dto';
import type { UserRow } from '../types/user.types';

/** `52998224725` -> `***.982.247-**`: o meio basta para conferir na lista. */
export const maskCpf = (cpf: string): string =>
  `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;

const toInvitation = (user: UserRow): UserDto['invitation'] =>
  user.status === 'pending' && user.temporaryPasswordExpiresAt
    ? {
        status:
          user.temporaryPasswordExpiresAt.getTime() > Date.now()
            ? 'pending'
            : 'expired',
        expiresAt: user.temporaryPasswordExpiresAt.toISOString(),
      }
    : null;

export const toUserResponse = (
  user: UserRow,
  _ctx: RequestContext,
  options: { maskCpf?: boolean } = {},
): UserDto => ({
  id: user.id,
  name: user.name,
  email: user.email,
  cpf: options.maskCpf ? maskCpf(user.cpf) : user.cpf,
  phone: user.phone,
  status: user.status,
  profile: { code: user.profileCode, name: user.profileName },
  invitation: toInvitation(user),
  lastAccessAt: user.lastAccessAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
  deletedAt: user.deletedAt?.toISOString() ?? null,
});
