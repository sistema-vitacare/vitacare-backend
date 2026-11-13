import type { TenantProfileCode } from '@/modules/Access/access.permissions';

export type UserStatus = 'pending' | 'active' | 'inactive';

/** Como o convite do UC03 chega ao usuario (BE-31). */
export const INVITATION_CHANNELS = ['email', 'temporary_password'] as const;

export type InvitationChannel = (typeof INVITATION_CHANNELS)[number];

/** O que a transacao grava para cada canal; o token cru nunca chega aqui. */
export type InvitationIssue =
  | { channel: 'temporary_password'; passwordHash: string; expiresAt: Date }
  | { channel: 'email'; tokenHash: string; expiresAt: Date };

/** Dados do e-mail de convite, lidos na transacao que grava o convite. */
export interface InvitationMailContext {
  invitationId: string;
  userId: string;
  userName: string;
  email: string;
  organizationName: string;
  organizationCode: string;
  profileName: string;
  inviterName: string;
}

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
  /** Convite por link mais recente (BE-31), so para usuario `pending`. */
  invitationExpiresAt: Date | null;
  invitationSentAt: Date | null;
  invitationRevokedAt: Date | null;
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
  invitation: InvitationIssue;
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
  invitation: InvitationIssue;
}

export type CreateUserOutcome =
  | { kind: 'created'; user: UserRow; mail: InvitationMailContext | null }
  | { kind: 'limit_reached' | 'plan_expired' | 'actor_forbidden' };

export type UpdateUserOutcome =
  { kind: 'updated' | 'unchanged'; user: UserRow } | { kind: 'not_found' };

export type DeactivateUserOutcome =
  | { kind: 'deactivated'; user: UserRow }
  | { kind: 'not_found' | 'already_inactive' | 'actor_forbidden' };

export type ReactivateUserOutcome =
  | { kind: 'reactivated'; user: UserRow }
  | {
      kind:
        | 'not_found'
        | 'already_active'
        | 'limit_reached'
        | 'plan_expired'
        | 'actor_forbidden';
    };

export type ReissueInvitationOutcome =
  | { kind: 'reissued'; mail: InvitationMailContext | null }
  | {
      kind: 'not_found' | 'already_accepted' | 'inactive' | 'actor_forbidden';
    };
