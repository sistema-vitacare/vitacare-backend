import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedPrincipal } from '../types/auth.types';

@Injectable()
export class AuthSessionRepository {
  constructor(private readonly dataSource: DataSource) {}

  async resolve(
    hash: string,
    now: Date,
  ): Promise<AuthenticatedPrincipal | null> {
    type SessionRow = Omit<AuthenticatedPrincipal, 'permissions'> & {
      profileId: string;
    };
    type PermissionRow = { code: string };
    const rows = await this.dataSource.query<SessionRow[]>(
      `SELECT s.id AS "sessionId", s.type AS "sessionType", s.user_id AS "userId", s.organization_id AS "organizationId", s.expires_at AS "absoluteExpiresAt", u.profile_id AS "profileId", p.code AS profile
       FROM auth_sessions s JOIN users u ON u.id=s.user_id AND u.organization_id=s.organization_id
       JOIN organizations o ON o.id=s.organization_id JOIN access_profiles p ON p.id=u.profile_id AND p.organization_id=u.organization_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.deleted_at IS NULL AND s.expires_at>$2
       AND u.status='active' AND u.deleted_at IS NULL AND o.status='active' AND o.deleted_at IS NULL`,
      [hash, now],
    );
    const row = rows[0];
    if (!row) return null;
    const permissions = await this.dataSource.query<PermissionRow[]>(
      `SELECT permission.code FROM profile_permissions pp JOIN permissions permission ON permission.id=pp.permission_id
       WHERE pp.profile_id=$1 AND pp.organization_id=$2 AND pp.deleted_at IS NULL AND permission.deleted_at IS NULL`,
      [row.profileId, row.organizationId],
    );
    return {
      ...row,
      profile: row.profile,
      permissions: new Set(permissions.map((item) => item.code)),
    };
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.dataSource.query(
      'UPDATE auth_sessions SET revoked_at=now(), revoked_reason=$2 WHERE id=$1 AND revoked_at IS NULL',
      [sessionId, reason],
    );
  }

  async create(
    organizationId: string,
    userId: string,
    tokenHash: string,
    type: 'normal' | 'password_change',
    expiresAt: Date,
  ): Promise<void> {
    await this.dataSource.query(
      'INSERT INTO auth_sessions (organization_id, user_id, token_hash, type, expires_at, last_activity_at) VALUES ($1,$2,$3,$4,$5,now())',
      [organizationId, userId, tokenHash, type, expiresAt],
    );
  }
}
