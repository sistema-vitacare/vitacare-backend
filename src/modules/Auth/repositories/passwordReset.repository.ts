import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
      await manager.query(
        `UPDATE password_reset_tokens SET revoked_at=now(), updated_at=now() WHERE organization_id=$1 AND user_id=$2 AND revoked_at IS NULL AND consumed_at IS NULL`,
        [organizationId, userId],
      );
      await manager.query(
        `INSERT INTO password_reset_tokens (organization_id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
        [organizationId, userId, tokenHash, expiresAt],
      );
    });
  }
  async revoke(hash: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE password_reset_tokens SET revoked_at=now(), updated_at=now() WHERE token_hash=$1 AND revoked_at IS NULL`,
      [hash],
    );
  }

  async consumeAndReset(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<
        Array<{ id: string; userId: string; organizationId: string }>
      >(
        `SELECT id, user_id AS "userId", organization_id AS "organizationId" FROM password_reset_tokens
         WHERE token_hash=$1 AND expires_at>now() AND consumed_at IS NULL AND revoked_at IS NULL AND deleted_at IS NULL FOR UPDATE`,
        [tokenHash],
      );
      const token = rows[0];
      if (!token) return false;
      const [, consumed] = (await manager.query(
        `UPDATE password_reset_tokens SET consumed_at=now(), updated_at=now() WHERE id=$1 AND consumed_at IS NULL`,
        [token.id],
      )) as unknown as [unknown, number];
      if (consumed !== 1) return false;
      await manager.query(
        `UPDATE users SET password_hash=$1, must_change_password=false, password_changed_at=now(), updated_at=now() WHERE id=$2 AND organization_id=$3 AND status='active' AND deleted_at IS NULL`,
        [passwordHash, token.userId, token.organizationId],
      );
      await manager.query(
        `UPDATE auth_sessions SET revoked_at=now(), revoked_reason='password_changed', updated_at=now() WHERE user_id=$1 AND organization_id=$2 AND revoked_at IS NULL AND deleted_at IS NULL`,
        [token.userId, token.organizationId],
      );
      await manager.query(
        `INSERT INTO audit_events (organization_id, actor_type, actor_user_id, action, entity_type, entity_id) VALUES ($1, 'user', $2, 'auth.password_recovered', 'user', $2)`,
        [token.organizationId, token.userId],
      );
      return true;
    });
  }
}
