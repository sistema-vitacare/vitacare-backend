import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import type { AuthSessionType } from '../entities/authSession.entity';

/** `UPDATE`/`INSERT` do driver `pg` devolvem `[linhas, afetadas]`. */
type WriteResult = [unknown, number];

const affectedRows = (result: WriteResult): number => result[1] ?? 0;

export interface CreateLoginSessionInput {
  organizationId: string;
  userId: string;
  tokenHash: string;
  type: AuthSessionType;
  expiresAt: Date;
  requestId?: string;
}

export interface CompleteFirstAccessInput {
  sessionId: string;
  userId: string;
  organizationId: string;
  passwordHash: string;
  requestId: string;
}

export interface ChangePasswordInput {
  userId: string;
  organizationId: string;
  passwordHash: string;
  requestId: string;
  action: string;
}

export interface ResetUserPasswordAsAdminInput {
  targetUserId: string;
  organizationId: string;
  actorUserId: string;
  passwordHash: string;
  requestId: string;
}

/**
 * Escritas de autenticacao que precisam ser atomicas: sessao, senha, revogacao
 * e auditoria nunca podem sair pela metade. Toda gravacao daqui e sempre por
 * organizacao e usuario, nunca por identificador solto.
 */
@Injectable()
export class AuthTransactionRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createLoginSession(input: CreateLoginSessionInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query<WriteResult>(
        `INSERT INTO auth_sessions
           (organization_id, user_id, token_hash, type, expires_at, last_activity_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          input.organizationId,
          input.userId,
          input.tokenHash,
          input.type,
          input.expiresAt,
        ],
      );

      await manager.query<WriteResult>(
        `UPDATE users
            SET last_access_at = now(), updated_at = now()
          WHERE id = $1
            AND organization_id = $2
            AND status = 'active'
            AND deleted_at IS NULL`,
        [input.userId, input.organizationId],
      );

      await this.writeAudit(manager, {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        entityId: input.userId,
        action:
          input.type === 'normal'
            ? 'auth.login_succeeded'
            : 'auth.first_access_started',
        requestId: input.requestId ?? null,
      });
    });
  }

  async completeFirstAccess(input: CompleteFirstAccessInput): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const revoked = await manager.query<WriteResult>(
        `UPDATE auth_sessions
            SET revoked_at = now(),
                revoked_reason = 'password_changed',
                updated_at = now()
          WHERE id = $1
            AND user_id = $2
            AND organization_id = $3
            AND type = 'password_change'
            AND revoked_at IS NULL
            AND deleted_at IS NULL`,
        [input.sessionId, input.userId, input.organizationId],
      );

      // Desafio ja consumido por outra submissao simultanea: nada muda.
      if (affectedRows(revoked) !== 1) {
        return false;
      }

      const updated = await manager.query<WriteResult>(
        `UPDATE users
            SET password_hash = $1,
                must_change_password = false,
                password_changed_at = now(),
                updated_at = now()
          WHERE id = $2
            AND organization_id = $3
            AND status = 'active'
            AND deleted_at IS NULL`,
        [input.passwordHash, input.userId, input.organizationId],
      );

      if (affectedRows(updated) !== 1) {
        return false;
      }

      await this.writeAudit(manager, {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        entityId: input.userId,
        action: 'auth.first_access_completed',
        requestId: input.requestId,
      });

      return true;
    });
  }

  async changePassword(input: ChangePasswordInput): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const updated = await manager.query<WriteResult>(
        `UPDATE users
            SET password_hash = $1,
                must_change_password = false,
                password_changed_at = now(),
                updated_at = now()
          WHERE id = $2
            AND organization_id = $3
            AND status = 'active'
            AND deleted_at IS NULL`,
        [input.passwordHash, input.userId, input.organizationId],
      );

      if (affectedRows(updated) !== 1) {
        return false;
      }

      await this.revokeSessionsOf(
        manager,
        input.userId,
        input.organizationId,
        'password_changed',
      );

      await this.writeAudit(manager, {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        entityId: input.userId,
        action: input.action,
        requestId: input.requestId,
      });

      return true;
    });
  }

  async resetUserPasswordAsAdmin(
    input: ResetUserPasswordAsAdminInput,
  ): Promise<'updated' | 'not_found'> {
    return this.dataSource.transaction(async (manager) => {
      const updated = await manager.query<WriteResult>(
        `UPDATE users
            SET password_hash = $1,
                must_change_password = true,
                password_changed_at = NULL,
                updated_at = now()
          WHERE id = $2
            AND organization_id = $3
            AND status = 'active'
            AND deleted_at IS NULL`,
        [input.passwordHash, input.targetUserId, input.organizationId],
      );

      if (affectedRows(updated) !== 1) {
        return 'not_found';
      }

      await this.revokeSessionsOf(
        manager,
        input.targetUserId,
        input.organizationId,
        'admin_password_reset',
      );

      await this.writeAudit(manager, {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        entityId: input.targetUserId,
        action: 'auth.admin_password_reset',
        requestId: input.requestId,
      });

      return 'updated';
    });
  }

  private async revokeSessionsOf(
    manager: EntityManager,
    userId: string,
    organizationId: string,
    reason: string,
  ): Promise<void> {
    await manager.query<WriteResult>(
      `UPDATE auth_sessions
          SET revoked_at = now(), revoked_reason = $3, updated_at = now()
        WHERE user_id = $1
          AND organization_id = $2
          AND revoked_at IS NULL
          AND deleted_at IS NULL`,
      [userId, organizationId, reason],
    );
  }

  private async writeAudit(
    manager: EntityManager,
    event: {
      organizationId: string;
      actorUserId: string;
      entityId: string;
      action: string;
      requestId: string | null;
    },
  ): Promise<void> {
    await manager.query<WriteResult>(
      `INSERT INTO audit_events
         (organization_id, actor_type, actor_user_id, action, entity_type, entity_id, request_id)
       VALUES ($1, 'user', $2, $3, 'user', $4, $5)`,
      [
        event.organizationId,
        event.actorUserId,
        event.action,
        event.entityId,
        event.requestId,
      ],
    );
  }
}
