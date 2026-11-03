import type { TenantProfileCode } from '@/modules/Access/access.permissions';

export type UserStatus = 'pending' | 'active' | 'inactive';

/** Usuario do tenant com o perfil vigente, como sai das consultas. */
export interface UserRow {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string | null;
  status: UserStatus;
  profileCode: string;
  profileName: string;
  temporaryPasswordExpiresAt: Date | null;
  lastAccessAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ListUsersFilter {
  status?: UserStatus;
  profileCode?: TenantProfileCode;
  search?: string;
  skip: number;
  take: number;
}

/** Organizacao, ator e requestId vem sempre da sessao, nunca do corpo. */
export interface UserActor {
  organizationId: string;
  actorUserId: string;
  requestId: string;
}

export interface CreateUserCommand extends UserActor {
  name: string;
  email: string;
  cpf: string;
  phone: string | null;
  profileCode: TenantProfileCode;
  passwordHash: string;
  expiresAt: Date;
}

export interface UserPatch {
  name?: string;
  email?: string;
  cpf?: string;
  phone?: string | null;
}

export interface UpdateUserCommand extends UserActor {
  targetUserId: string;
  patch: UserPatch;
}

export interface TargetUserCommand extends UserActor {
  targetUserId: string;
}

export interface ReissueInvitationCommand extends TargetUserCommand {
  passwordHash: string;
  expiresAt: Date;
}

export type CreateUserOutcome =
  | { kind: 'created'; user: UserRow }
  | { kind: 'limit_reached' }
  | { kind: 'actor_forbidden' };

export type UpdateUserOutcome =
  { kind: 'updated' | 'unchanged'; user: UserRow } | { kind: 'not_found' };

export type DeactivateUserOutcome =
  | { kind: 'deactivated'; user: UserRow }
  | { kind: 'not_found' | 'already_inactive' | 'actor_forbidden' };

export type ReactivateUserOutcome =
  | { kind: 'reactivated'; user: UserRow }
  | {
      kind:
        'not_found' | 'already_active' | 'limit_reached' | 'actor_forbidden';
    };

export type ReissueInvitationOutcome =
  | { kind: 'reissued' }
  | {
      kind: 'not_found' | 'already_accepted' | 'inactive' | 'actor_forbidden';
    };
