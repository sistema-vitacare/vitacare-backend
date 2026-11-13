import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';

/** `UPDATE` do driver `pg` devolve `[linhas, afetadas]`. */
type WriteResult = [unknown, number];

const affectedRows = (result: WriteResult): number => result[1] ?? 0;

export const INVITATION_REVOKE_REASONS = [
  'send_failed',
  'reissued',
  'email_changed',
  'user_deactivated',
  'organization_deactivated',
  'channel_changed',
] as const;

export type InvitationRevokeReason = (typeof INVITATION_REVOKE_REASONS)[number];

/** Convite vivo: nem consumido, nem revogado, nem excluido. */
const LIVE = `consumed_at IS NULL AND revoked_at IS NULL AND deleted_at IS NULL`;

/**
 * Quem ainda pode aceitar: usuario `pending` sem senha (modo link), nao
 * excluido, de organizacao ativa. O resto responde como token invalido.
 */
const ACCEPTABLE = `
      i.consumed_at IS NULL
  AND i.revoked_at IS NULL
  AND i.deleted_at IS NULL
  AND i.expires_at > now()
  AND u.status = 'pending'
  AND u.password_hash IS NULL
  AND u.deleted_at IS NULL
  AND o.status = 'active'
  AND o.deleted_at IS NULL`;

export interface NewUserInvitation {
  organizationId: string;
  userId: string;
  invitedByUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Grava o convite na transacao de quem cadastra ou reemite. */
export const insertUserInvitation = async (
  manager: EntityManager,
  invitation: NewUserInvitation,
): Promise<string> => {
  const [{ id }] = await manager.query<Array<{ id: string }>>(
    `INSERT INTO user_invitations
       (organization_id, user_id, invited_by_user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      invitation.organizationId,
      invitation.userId,
      invitation.invitedByUserId,
      invitation.tokenHash,
      invitation.expiresAt,
    ],
  );

  return id;
};

/**
 * Revoga os convites vivos de um usuario ou, sem `userId`, da organizacao
 * inteira. Quem chama ja travou o usuario (ou a organizacao), na mesma ordem
 * do aceite: usuario antes do convite.
 */
export const revokeLiveUserInvitations = async (
  manager: EntityManager,
  target: {
    organizationId: string;
    userId?: string;
    reason: InvitationRevokeReason;
  },
): Promise<number> => {
  const result = await manager.query<WriteResult>(
    `UPDATE user_invitations
        SET revoked_at = now(), revoked_reason = $3, updated_at = now()
      WHERE organization_id = $1
        AND ($2::uuid IS NULL OR user_id = $2::uuid)
        AND ${LIVE}`,
    [target.organizationId, target.userId ?? null, target.reason],
  );

  return affectedRows(result);
};

export interface InvitationDeliveryRecord {
  invitationId: string;
  organizationId: string;
  userId: string;
  actorUserId: string;
  requestId: string;
  expiresAt: Date;
}

export interface InvitationPreviewRow {
  userName: string;
  email: string;
  organizationCode: string;
  organizationName: string;
  profileCode: string;
  profileName: string;
  expiresAt: Date;
}

export interface AcceptedInvitation {
  organizationCode: string;
  email: string;
}

interface AcceptCandidate {
  invitationId: string;
  userId: string;
  organizationId: string;
}

/**
 * Convites por link do UC03 (BE-31). Apenas o SHA-256 do token e persistido.
 * O aceite trava o usuario antes do convite, na mesma ordem da reemissao, da
 * inativacao e da troca de e-mail, para nunca entrar em deadlock com elas.
 */
@Injectable()
export class UserInvitationRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** O SMTP aceitou: grava `sent_at` se o convite ainda estiver vivo. */
  async recordSent(record: InvitationDeliveryRecord): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const updated = await manager.query<WriteResult>(
        `UPDATE user_invitations
            SET sent_at = now(), updated_at = now()
          WHERE id = $1
            AND organization_id = $2
            AND ${LIVE}`,
        [record.invitationId, record.organizationId],
      );

      if (affectedRows(updated) !== 1) return;

      await insertAuditEvent(manager, {
        organizationId: record.organizationId,
        actorUserId: record.actorUserId,
        action: 'user.invitation_sent',
        entityType: 'user',
        entityId: record.userId,
        afterValues: { expiresAt: record.expiresAt.toISOString() },
        requestId: record.requestId,
      });
    });
  }

  /** Sem entrega nao sobra link valido: revoga e audita a falha. */
  async recordSendFailure(record: InvitationDeliveryRecord): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query<WriteResult>(
        `UPDATE user_invitations
            SET revoked_at = now(), revoked_reason = 'send_failed', updated_at = now()
          WHERE id = $1
            AND organization_id = $2
            AND ${LIVE}`,
        [record.invitationId, record.organizationId],
      );

      await insertAuditEvent(manager, {
        organizationId: record.organizationId,
        actorUserId: record.actorUserId,
        action: 'user.invitation_failed',
        entityType: 'user',
        entityId: record.userId,
        afterValues: { reason: 'send_failed' },
        requestId: record.requestId,
      });
    });
  }

  /** Le sem consumir; `null` para qualquer motivo de invalidade. */
  async inspect(tokenHash: string): Promise<InvitationPreviewRow | null> {
    const [row] = await this.dataSource.query<InvitationPreviewRow[]>(
      `SELECT u.name AS "userName",
              u.email,
              o.code AS "organizationCode",
              o.trade_name AS "organizationName",
              p.code AS "profileCode",
              p.name AS "profileName",
              i.expires_at AS "expiresAt"
         FROM user_invitations i
         JOIN users u
           ON u.id = i.user_id
          AND u.organization_id = i.organization_id
         JOIN organizations o
           ON o.id = i.organization_id
         JOIN access_profiles p
           ON p.id = u.profile_id
          AND p.organization_id = u.organization_id
        WHERE i.token_hash = $1
          AND ${ACCEPTABLE}`,
      [tokenHash],
    );

    return row ?? null;
  }

  /**
   * Consome o convite e ativa o usuario numa transacao. Duas submissoes do
   * mesmo token: so uma vence. Qualquer condicao que falhe responde `null`
   * sem gravar nada.
   */
  async accept(
    tokenHash: string,
    passwordHash: string,
    requestId: string | null,
  ): Promise<AcceptedInvitation | null> {
    return this.dataSource.transaction(async (manager) => {
      const [candidate] = await manager.query<AcceptCandidate[]>(
        `SELECT i.id AS "invitationId",
                i.user_id AS "userId",
                i.organization_id AS "organizationId"
           FROM user_invitations i
          WHERE i.token_hash = $1`,
        [tokenHash],
      );

      if (!candidate) return null;

      await manager.query(
        `SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [candidate.userId, candidate.organizationId],
      );

      const [accepted] = await manager.query<AcceptedInvitation[]>(
        `SELECT o.code AS "organizationCode", u.email::text AS email
           FROM user_invitations i
           JOIN users u
             ON u.id = i.user_id
            AND u.organization_id = i.organization_id
           JOIN organizations o
             ON o.id = i.organization_id
          WHERE i.id = $1
            AND ${ACCEPTABLE}
          FOR UPDATE OF i`,
        [candidate.invitationId],
      );

      if (!accepted) return null;

      await manager.query(
        `UPDATE user_invitations
            SET consumed_at = now(), updated_at = now()
          WHERE id = $1`,
        [candidate.invitationId],
      );

      await manager.query(
        `UPDATE users
            SET status = 'active',
                password_hash = $3,
                must_change_password = false,
                temporary_password_expires_at = NULL,
                password_changed_at = now(),
                updated_at = now()
          WHERE id = $1
            AND organization_id = $2`,
        [candidate.userId, candidate.organizationId, passwordHash],
      );

      await insertAuditEvent(manager, {
        organizationId: candidate.organizationId,
        actorUserId: candidate.userId,
        action: 'user.invitation_accepted',
        entityType: 'user',
        entityId: candidate.userId,
        requestId,
      });

      return accepted;
    });
  }
}
