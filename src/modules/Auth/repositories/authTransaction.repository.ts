import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthTransactionRepository {
  constructor(private readonly dataSource: DataSource) {}

  async completeFirstAccess(input: {
    sessionId: string;
    userId: string;
    organizationId: string;
    passwordHash: string;
    requestId: string;
  }): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const revoked = (await manager.query(
        `UPDATE auth_sessions SET revoked_at=now(), revoked_reason='password_changed', updated_at=now()
         WHERE id=$1 AND user_id=$2 AND organization_id=$3 AND type='password_change' AND revoked_at IS NULL AND deleted_at IS NULL`,
        [input.sessionId, input.userId, input.organizationId],
      )) as unknown as [unknown, number];
      if (revoked[1] !== 1) return false;
      await manager.query(
        `UPDATE users SET password_hash=$1, must_change_password=false, password_changed_at=now(), updated_at=now()
         WHERE id=$2 AND organization_id=$3 AND status='active' AND deleted_at IS NULL`,
        [input.passwordHash, input.userId, input.organizationId],
      );
      await manager.query(
        `INSERT INTO audit_events (organization_id, actor_type, actor_user_id, action, entity_type, entity_id, request_id)
         VALUES ($1, 'user', $2, 'auth.first_access_completed', 'user', $2, $3)`,
        [input.organizationId, input.userId, input.requestId],
      );
      return true;
    });
  }

  async createLoginSession(input: {
    organizationId: string;
    userId: string;
    tokenHash: string;
    type: 'normal' | 'password_change';
    expiresAt: Date;
    requestId?: string;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO auth_sessions (organization_id, user_id, token_hash, type, expires_at, last_activity_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [
          input.organizationId,
          input.userId,
          input.tokenHash,
          input.type,
          input.expiresAt,
        ],
      );
      await manager.query(
        `UPDATE users SET last_access_at=now(), updated_at=now()
         WHERE id=$1 AND organization_id=$2 AND status='active' AND deleted_at IS NULL`,
        [input.userId, input.organizationId],
      );
      await manager.query(
        `INSERT INTO audit_events (organization_id, actor_type, actor_user_id, action, entity_type, entity_id, request_id)
         VALUES ($1, 'user', $2, $3, 'user', $2, $4)`,
        [
          input.organizationId,
          input.userId,
          input.type === 'normal'
            ? 'auth.login_succeeded'
            : 'auth.first_access_started',
          input.requestId ?? null,
        ],
      );
    });
  }

  async changePassword(input: {
    userId: string;
    organizationId: string;
    passwordHash: string;
    requestId: string;
    action: string;
  }): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const [, affected] = (await manager.query(
        `UPDATE users SET password_hash=$1, must_change_password=false, password_changed_at=now(), updated_at=now()
         WHERE id=$2 AND organization_id=$3 AND status='active' AND deleted_at IS NULL`,
        [input.passwordHash, input.userId, input.organizationId],
      )) as unknown as [unknown, number];
      if (affected !== 1) return false;
      await manager.query(
        `UPDATE auth_sessions SET revoked_at=now(), revoked_reason='password_changed', updated_at=now()
         WHERE user_id=$1 AND organization_id=$2 AND revoked_at IS NULL AND deleted_at IS NULL`,
        [input.userId, input.organizationId],
      );
      await manager.query(
        `INSERT INTO audit_events (organization_id, actor_type, actor_user_id, action, entity_type, entity_id, request_id)
         VALUES ($1, 'user', $2, $3, 'user', $2, $4)`,
        [input.organizationId, input.userId, input.action, input.requestId],
      );
      return true;
    });
  }

  async resetUserPasswordAsAdmin(input: {
    targetUserId: string;
    organizationId: string;
    actorUserId: string;
    passwordHash: string;
    requestId: string;
  }): Promise<'updated' | 'not_found'> {
    return this.dataSource.transaction(async (manager) => {
      const [, affected] = (await manager.query(
        `UPDATE users SET password_hash=$1, must_change_password=true, password_changed_at=NULL, updated_at=now()
         WHERE id=$2 AND organization_id=$3 AND status='active' AND deleted_at IS NULL`,
        [input.passwordHash, input.targetUserId, input.organizationId],
      )) as unknown as [unknown, number];
      if (affected !== 1) return 'not_found';
      await manager.query(
        `UPDATE auth_sessions SET revoked_at=now(), revoked_reason='admin_password_reset', updated_at=now() WHERE user_id=$1 AND organization_id=$2 AND revoked_at IS NULL AND deleted_at IS NULL`,
        [input.targetUserId, input.organizationId],
      );
      await manager.query(
        `INSERT INTO audit_events (organization_id, actor_type, actor_user_id, action, entity_type, entity_id, request_id) VALUES ($1, 'user', $2, 'auth.admin_password_reset', 'user', $3, $4)`,
        [
          input.organizationId,
          input.actorUserId,
          input.targetUserId,
          input.requestId,
        ],
      );
      return 'updated';
    });
  }
}
