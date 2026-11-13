import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { currentRequestIp } from '@/common/context/requestMetadata';
import type { RequestContext } from '@/common/context/requestContext.type';
import { inPeriod } from '@/common/sql/localPeriod';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';

import type {
  AcceptTermsOutcome,
  TermsAcceptanceFilter,
  TermsAcceptanceListRow,
  TermsAcceptanceRow,
} from '../types/terms.types';

const ROW = `a.id, a.terms_version AS version, a.content_hash AS "contentHash",
             a.accepted_at AS "acceptedAt"`;

export interface AcceptTermsInput {
  ctx: RequestContext;
  version: number;
  userAgent: string | null;
}

/**
 * Prova do aceite do termo (BE-32). A escrita e so `INSERT`: a tabela recusa
 * `UPDATE` e `DELETE` por trigger. O escopo de organizacao vem sempre da
 * sessao ou do filtro resolvido por ela.
 */
@Injectable()
export class TermsAcceptanceRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Na mesma transacao: confere que a versao pedida e a vigente (travando-a
   * contra uma publicacao simultanea), grava o aceite com o perfil do instante
   * e audita. Repetido ou concorrente nao duplica: devolve o aceite que ja
   * existe, sem novo evento.
   */
  accept(input: AcceptTermsInput): Promise<AcceptTermsOutcome> {
    const { ctx } = input;

    return this.dataSource.transaction(async (manager) => {
      const [current] = await manager.query<
        Array<{ id: string; version: number; contentHash: string }>
      >(
        `SELECT id, version, content_hash AS "contentHash"
           FROM terms_versions
          ORDER BY version DESC
          LIMIT 1
          FOR SHARE`,
      );

      if (!current || current.version !== input.version) {
        return { notCurrent: current?.version ?? null };
      }

      const inserted = await manager.query<TermsAcceptanceRow[]>(
        `INSERT INTO terms_acceptances AS a
           (organization_id, user_id, terms_version_id, terms_version,
            content_hash, profile_code, ip_address, user_agent, request_id)
         SELECT u.organization_id, u.id, $3, $4, $5, p.code, $6, $7, $8
           FROM users u
           JOIN access_profiles p
             ON p.id = u.profile_id AND p.organization_id = u.organization_id
          WHERE u.id = $1 AND u.organization_id = $2
         ON CONFLICT ON CONSTRAINT terms_acceptances_user_version_unique DO NOTHING
         RETURNING ${ROW}`,
        [
          ctx.userId,
          ctx.organizationId,
          current.id,
          current.version,
          current.contentHash,
          currentRequestIp(),
          input.userAgent,
          ctx.requestId,
        ],
      );

      if (inserted[0]) {
        await insertAuditEvent(manager, {
          organizationId: ctx.organizationId,
          actorUserId: ctx.userId,
          action: 'terms.accepted',
          entityType: 'terms_version',
          entityId: current.id,
          afterValues: { version: current.version },
          requestId: ctx.requestId,
        });

        return { row: inserted[0], created: true };
      }

      const [existing] = await manager.query<TermsAcceptanceRow[]>(
        `SELECT ${ROW} FROM terms_acceptances a
          WHERE a.user_id = $1 AND a.organization_id = $2
            AND a.terms_version_id = $3`,
        [ctx.userId, ctx.organizationId, current.id],
      );

      if (!existing) {
        throw new Error('Aceite nao gravado e nao encontrado para o usuario.');
      }

      return { row: existing, created: false };
    });
  }

  listOwn(
    userId: string,
    organizationId: string,
  ): Promise<TermsAcceptanceRow[]> {
    return this.dataSource.query<TermsAcceptanceRow[]>(
      `SELECT ${ROW} FROM terms_acceptances a
        WHERE a.user_id = $1 AND a.organization_id = $2
        ORDER BY a.terms_version DESC`,
      [userId, organizationId],
    );
  }

  async list(
    filter: TermsAcceptanceFilter,
    skip: number,
    take: number,
  ): Promise<[TermsAcceptanceListRow[], number]> {
    const where = this.where(filter);
    const [{ total }] = await this.dataSource.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS total FROM terms_acceptances a ${where.sql}`,
      where.params,
    );

    if (total === 0) return [[], 0];

    const rows = await this.dataSource.query<TermsAcceptanceListRow[]>(
      `SELECT ${ROW},
              a.organization_id AS "organizationId",
              o.trade_name AS "organizationName",
              a.user_id AS "userId",
              u.name AS "userName",
              a.profile_code AS "profileCode",
              host(a.ip_address) AS "ipAddress",
              a.user_agent AS "userAgent",
              a.request_id AS "requestId"
         FROM terms_acceptances a
         JOIN organizations o ON o.id = a.organization_id
         JOIN users u ON u.id = a.user_id AND u.organization_id = a.organization_id
         ${where.sql}
        ORDER BY a.accepted_at DESC, a.id DESC
        LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
      [...where.params, take, skip],
    );

    return [rows, total];
  }

  private where(filter: TermsAcceptanceFilter): {
    sql: string;
    params: unknown[];
  } {
    // `inPeriod` usa $2/$3; $1 fica para a organizacao (ou nula = todas).
    const params: unknown[] = [
      filter.organizationId,
      filter.period.from,
      filter.period.to,
    ];
    const conditions = [
      '($1::uuid IS NULL OR a.organization_id = $1::uuid)',
      inPeriod('a.accepted_at'),
    ];

    if (filter.version !== undefined) {
      params.push(filter.version);
      conditions.push(`a.terms_version = $${params.length}`);
    }

    if (filter.userId !== undefined) {
      params.push(filter.userId);
      conditions.push(`a.user_id = $${params.length}::uuid`);
    }

    return { sql: `WHERE ${conditions.join(' AND ')}`, params };
  }
}
