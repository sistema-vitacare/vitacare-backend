import type { RequestContext } from '@/common/context/requestContext.type';

import type { UserDto } from '../dtos/user.dto';
import type { UserRow } from '../types/user.types';

/** `52998224725` -> `***.982.247-**`: o meio basta para conferir na lista. */
export const maskCpf = (cpf: string): string =>
  `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;

const isFuture = (date: Date): boolean => date.getTime() > Date.now();

/**
 * Situacao do convite do pendente (BE-31). A constraint `users_pending_check`
 * separa os modos: prazo de senha provisoria preenchido e o canal
 * `temporary_password`; sem ele, o convite e o link mais recente.
 */
const toInvitation = (user: UserRow): UserDto['invitation'] => {
  if (user.status !== 'pending') return null;

  if (user.temporaryPasswordExpiresAt) {
    return {
      channel: 'temporary_password',
      status: isFuture(user.temporaryPasswordExpiresAt) ? 'pending' : 'expired',
      expiresAt: user.temporaryPasswordExpiresAt.toISOString(),
      sentAt: null,
    };
  }

  // Pendente por link sempre nasce com o convite na mesma transacao; sem linha
  // (dado inconsistente), o administrador ve um convite a reemitir.
  if (!user.invitationExpiresAt) {
    return {
      channel: 'email',
      status: 'invalidated',
      expiresAt: user.updatedAt.toISOString(),
      sentAt: null,
    };
  }

  return {
    channel: 'email',
    status: user.invitationRevokedAt
      ? 'invalidated'
      : isFuture(user.invitationExpiresAt)
        ? 'pending'
        : 'expired',
    expiresAt: user.invitationExpiresAt.toISOString(),
    sentAt: user.invitationSentAt?.toISOString() ?? null,
  };
};

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
