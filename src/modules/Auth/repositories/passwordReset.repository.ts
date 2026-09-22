import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** `UPDATE`/`INSERT` do driver `pg` devolvem `[linhas, afetadas]`. */
type WriteResult = [unknown, number];

const affectedRows = (result: WriteResult): number => result[1] ?? 0;

interface ResetTokenRow {
  id: string;
  userId: string;
  organizationId: string;
}

/**
 * Tokens de recuperacao por link. Apenas o SHA-256 do token e persistido, e o
 * consumo acontece dentro da mesma transacao que grava a senha: duas
 * submissoes do mesmo token nao podem vencer as duas.
 */
@Injectable()
export class PasswordResetRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    organizationId: string,
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Uma nova solicitacao invalida as anteriores da mesma conta.
      await manager.query<WriteResult>(
        `UPDATE password_reset_tokens
            SET revoked_at = now(), updated_at = now()
          WHERE organization_id = $1
            AND user_id = $2
            AND revoked_at IS NULL
            AND consumed_at IS NULL`,
        [organizationId, userId],
      );

      await manager.query<WriteResult>(
        `INSERT INTO password_reset_tokens
           (organization_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [organizationId, userId, tokenHash, expiresAt],
      );
    });
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE password_reset_tokens
          SET revoked_at = now(), updated_at = now()
        WHERE token_hash = $1
          AND revoked_at IS NULL`,
      [tokenHash],
    );
  }

  async consumeAndReset(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<ResetTokenRow[]>(
        `SELECT id, user_id AS "userId", organization_id AS "organizationId"
           FROM password_reset_tokens
          WHERE token_hash = $1
            AND expires_at > now()
            AND consumed_at IS NULL
            AND revoked_at IS NULL
            AND deleted_at IS NULL
          FOR UPDATE`,
        [tokenHash],
      );

      const token = rows[0];

      if (!token) {
        return false;
      }

      const consumed = await manager.query<WriteResult>(
        `UPDATE password_reset_tokens
            SET consumed_at = now(), updated_at = now()
          WHERE id = $1
            AND consumed_at IS NULL`,
        [token.id],
      );

      if (affectedRows(consumed) !== 1) {
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
        [passwordHash, token.userId, token.organizationId],
      );

      // Conta inativada depois do envio do link: o token morre sem efeito.
      if (affectedRows(updated) !== 1) {
        return false;
      }

      await manager.query<WriteResult>(
        `UPDATE auth_sessions
            SET revoked_at = now(),
                revoked_reason = 'password_changed',
                updated_at = now()
          WHERE user_id = $1
            AND organization_id = $2
            AND revoked_at IS NULL
            AND deleted_at IS NULL`,
        [token.userId, token.organizationId],
      );

      await manager.query<WriteResult>(
        `INSERT INTO audit_events
           (organization_id, actor_type, actor_user_id, action, entity_type, entity_id)
         VALUES ($1, 'user', $2, 'auth.password_recovered', 'user', $2)`,
        [token.organizationId, token.userId],
      );

      return true;
    });
  }
}
