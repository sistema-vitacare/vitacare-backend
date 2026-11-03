import type { TenantProfileCode } from '@/modules/Access/access.permissions';

/** Organizacao, ator e requestId vem sempre da sessao, nunca do corpo. */
export interface ChangeProfileCommand {
  organizationId: string;
  actorUserId: string;
  targetUserId: string;
  profileCode: TenantProfileCode;
  requestId: string;
}

/** Usuario alvo com o perfil vigente depois da operacao. */
export interface UserProfileView {
  id: string;
  name: string;
  profileCode: string;
  profileName: string;
}

export type ChangeProfileOutcome =
  | { kind: 'not_found' }
  | { kind: 'actor_forbidden' }
  | { kind: 'unchanged'; user: UserProfileView }
  | { kind: 'changed'; user: UserProfileView };
