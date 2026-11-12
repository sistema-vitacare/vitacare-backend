export interface OwnProfilePatch {
  name?: string;
  email?: string;
  phone?: string | null;
}

export interface UpdateOwnProfileCommand {
  organizationId: string;
  userId: string;
  requestId: string;
  patch: OwnProfilePatch;
  /**
   * Hash conferido com a senha atual antes da transacao. A troca de e-mail so
   * grava se o hash da linha travada ainda for este.
   */
  verifiedPasswordHash: string | null;
}

export type UpdateOwnProfileOutcome =
  | { kind: 'updated' | 'unchanged' }
  | { kind: 'inactive' }
  | { kind: 'reauthentication_failed' };
