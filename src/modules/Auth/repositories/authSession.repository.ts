import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import type { AuthenticatedPrincipal } from '../types/auth.types';
import { loadEffectivePermissions } from './effectivePermissions.query';

interface SessionRow extends Omit<AuthenticatedPrincipal, 'permissions'> {
  profileId: string;
}

/**
 * Leitura de sessao. A revogacao vive em `AuthTransactionRepository`, junto do
 * evento de auditoria que precisa sair na mesma transacao. Toda validade fica
 * em SQL, em uma unica sentenca: a sessao so e aceita quando o token bate, nao
 * foi revogada, esta dentro do prazo absoluto e da janela de inatividade, e
 * tanto o usuario quanto a organizacao continuam ativos. A mesma sentenca
 * renova `last_activity_at`, entao nao existe janela entre validar e renovar.
 */
@Injectable()
export class AuthSessionRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async resolve(
    hash: string,
    now: Date,
  ): Promise<AuthenticatedPrincipal | null> {
    const idleSeconds = this.config.getOrThrow<number>(
      'auth.sessionIdleSeconds',
    );

    const idleCutoff = new Date(now.getTime() - idleSeconds * 1000);

    const rows = await this.dataSource.query<SessionRow[]>(
      `WITH touched AS (
         UPDATE auth_sessions s
            SET last_activity_at = $2, updated_at = now()
           FROM users u, organizations o
          WHERE s.token_hash = $1
            AND u.id = s.user_id
            AND u.organization_id = s.organization_id
            AND o.id = s.organization_id
            AND s.revoked_at IS NULL
            AND s.deleted_at IS NULL
            AND s.expires_at > $2
            AND s.last_activity_at > $3
            AND (u.status = 'active'
                 OR (u.status = 'pending' AND s.type = 'password_change'))
            AND u.deleted_at IS NULL
            AND o.status = 'active'
            AND o.deleted_at IS NULL
        RETURNING s.id, s.type, s.user_id, s.organization_id, s.expires_at, u.profile_id, o.kind
       )
       SELECT t.id AS "sessionId",
              t.type AS "sessionType",
              t.user_id AS "userId",
              t.organization_id AS "organizationId",
              t.kind AS "organizationKind",
              t.expires_at AS "absoluteExpiresAt",
              t.profile_id AS "profileId",
              p.code AS profile
         FROM touched t
         JOIN access_profiles p
           ON p.id = t.profile_id
          AND p.organization_id = t.organization_id`,
      [hash, now, idleCutoff],
    );

    const row = rows[0];

    if (!row) {
      return null;
    }

    const { profileId, ...principal } = row;

    return {
      ...principal,
      permissions: new Set(
        await loadEffectivePermissions(
          this.dataSource,
          profileId,
          row.organizationId,
          row.organizationKind,
        ),
      ),
    };
  }
}
