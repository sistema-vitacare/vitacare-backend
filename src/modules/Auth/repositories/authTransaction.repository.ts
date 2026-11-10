import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';

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
  /** Hash contra o qual a senha foi verificada, fora da transacao. */
  passwordHash: string;
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

export interface RecordLoginFailureInput {
  organizationId: string;
  /** `null` quando o e-mail nao pertence a nenhuma conta da organizacao. */
  userId: string | null;
  requestId: string | null;
}

export interface RecordLogoutInput {
  sessionId: string;
  userId: string;
  organizationId: string;
  requestId: string;
}

export interface ResetUserPasswordAsAdminInput {
  targetUserId: string;
  organizationId: string;
  actorUserId: string;
  passwordHash: string;
  expiresAt: Date;
  requestId: string;
}

/** Revoga todas as sessoes abertas do usuario, na transacao do chamador. */
export const revokeUserSessions = async (
  manager: EntityManager,
  userId: string,
  organizationId: string,
  reason: string,
): Promise<void> => {
  await manager.query(
    `UPDATE auth_sessions
        SET revoked_at = now(), revoked_reason = $3, updated_at = now()
      WHERE user_id = $1
        AND organization_id = $2
        AND revoked_at IS NULL
        AND deleted_at IS NULL`,
    [userId, organizationId, reason],
  );
};

/**
 * Escritas de autenticacao que precisam ser atomicas: sessao, senha, revogacao
 * e auditoria nunca podem sair pela metade. Toda gravacao daqui e sempre por
 * organizacao e usuario, nunca por identificador solto.
 */
@Injectable()
export class AuthTransactionRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * A senha foi verificada sem trava, entao uma reemissao de convite, uma
   * redefinicao administrativa ou uma inativacao pode ter comitado no meio. A
   * linha do usuario e travada e relida com o hash verificado antes de abrir a
   * sessao: senha trocada ou conta inativada nao abrem sessao, e quem revogar
   * depois desta transacao ja enxerga a sessao nova. Devolve `false` sem gravar.
   */
  async createLoginSession(input: CreateLoginSessionInput): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const [current] = await manager.query<Array<{ id: string }>>(
        `SELECT id
           FROM users
          WHERE id = $1
            AND organization_id = $2
            AND password_hash = $3
            AND status IN ('pending', 'active')
            AND deleted_at IS NULL
          FOR NO KEY UPDATE`,
        [input.userId, input.organizationId, input.passwordHash],
      );

      if (!current) {
        return false;
      }

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
            AND status IN ('pending', 'active')
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

      return true;
    });
  }

  /**
   * A tentativa recusada fica registrada na organizacao que o codigo apontou,
   * com autor quando a conta existe e como evento de sistema quando nao
   * existe. Sem organizacao conhecida nao ha linha possivel: `organization_id`
   * e obrigatorio e referencia a tabela, entao o chamador nem chega aqui.
   */
  async recordLoginFailure(input: RecordLoginFailureInput): Promise<void> {
    await this.writeAudit(this.dataSource.manager, {
      organizationId: input.organizationId,
      actorUserId: input.userId,
      entityId: input.userId,
      action: 'auth.login_failed',
      requestId: input.requestId,
    });
  }

  /**
   * Revogacao e auditoria do logout na mesma transacao, sempre pela sessao da
   * propria organizacao e do proprio usuario. Sessao ja revogada nao gera
   * evento novo: a resposta segue igual, mas a auditoria nao ganha linha que
   * nao corresponde a nada.
   */
  async recordLogout(input: RecordLogoutInput): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const revoked = await manager.query<WriteResult>(
        `UPDATE auth_sessions
            SET revoked_at = now(),
                revoked_reason = 'logout',
                updated_at = now()
          WHERE id = $1
            AND user_id = $2
            AND organization_id = $3
            AND revoked_at IS NULL
            AND deleted_at IS NULL`,
        [input.sessionId, input.userId, input.organizationId],
      );

      if (affectedRows(revoked) !== 1) {
        return false;
      }

      await this.writeAudit(manager, {
        organizationId: input.organizationId,
        actorUserId: input.userId,
        entityId: input.userId,
        action: 'auth.logout',
        requestId: input.requestId,
      });

      return true;
    });
  }

  /**
   * A linha do usuario e travada antes da sessao, na mesma ordem da
   * inativacao e da reemissao do convite (usuario, depois sessoes); na ordem
   * inversa as duas transacoes se esperariam (40P01).
   */
  async completeFirstAccess(input: CompleteFirstAccessInput): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 FOR NO KEY UPDATE`,
        [input.userId, input.organizationId],
      );

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
                temporary_password_expires_at = NULL,
                status = 'active',
                updated_at = now()
          WHERE id = $2
            AND organization_id = $3
            AND status IN ('pending', 'active')
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
                temporary_password_expires_at = NULL,
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

      await revokeUserSessions(
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
                temporary_password_expires_at = $4,
                updated_at = now()
          WHERE id = $2
            AND organization_id = $3
            AND status = 'active'
            AND deleted_at IS NULL`,
        [
          input.passwordHash,
          input.targetUserId,
          input.organizationId,
          input.expiresAt,
        ],
      );

      if (affectedRows(updated) !== 1) {
        return 'not_found';
      }

      // Link de recuperacao emitido antes nao pode sobreviver a senha nova.
      await manager.query<WriteResult>(
        `DELETE FROM password_reset_tokens
          WHERE user_id = $1
            AND organization_id = $2`,
        [input.targetUserId, input.organizationId],
      );

      await revokeUserSessions(
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

  /**
   * Sem autor conhecido o evento e de sistema, como exige
   * `audit_events_actor_check`. Nenhum dado digitado na tentativa entra aqui:
   * o `request_id` liga a linha ao log da requisicao e basta para investigar.
   */
  private async writeAudit(
    manager: EntityManager,
    event: {
      organizationId: string;
      actorUserId: string | null;
      entityId: string | null;
      action: string;
      requestId: string | null;
    },
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: 'user',
      entityId: event.entityId,
      requestId: event.requestId,
    });
  }
}
