import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';

import { auditSeveritySql } from '../policies/auditCatalog.policy';
import type {
  AuditEventFilter,
  AuditEventRow,
} from '../types/auditEvent.types';

const SEVERITY = auditSeveritySql('e.action', 'e.after_values');

/** Nome legivel do item; nomes clinicos so na organizacao de quem consulta. */
const entityLabel = (viewer: string) => `CASE e.entity_type
    WHEN 'user' THEN (SELECT u.name FROM users u
                       WHERE u.id = e.entity_id AND u.organization_id = e.organization_id)
    WHEN 'organization' THEN (SELECT eo.trade_name FROM organizations eo WHERE eo.id = e.entity_id)
    WHEN 'patient' THEN CASE WHEN e.organization_id = ${viewer} THEN
      (SELECT p.name FROM patients p
        WHERE p.id = e.entity_id AND p.organization_id = e.organization_id) END
    WHEN 'follow_up_form' THEN CASE WHEN e.organization_id = ${viewer} THEN
      (SELECT f.name FROM follow_up_forms f
        WHERE f.id = e.entity_id AND f.organization_id = e.organization_id) END
    WHEN 'medication' THEN CASE WHEN e.organization_id = ${viewer} THEN
      (SELECT m.name FROM medications m
        WHERE m.id = e.entity_id AND m.organization_id = e.organization_id) END
  END`;

const FROM = `FROM audit_events e
  JOIN organizations o ON o.id = e.organization_id
  LEFT JOIN users actor
    ON actor.id = e.actor_user_id AND actor.organization_id = e.organization_id`;

/** `%`, `_` e `\` digitados na busca valem como texto. */
const escapeLike = (term: string): string =>
  term.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Leitura da trilha (UC06). O escopo de organizacao vem sempre do filtro
 * resolvido pela sessao; a escrita continua em `insertAuditEvent`.
 */
@Injectable()
export class AuditEventQueryRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    filter: AuditEventFilter,
    skip: number,
    take: number,
  ): Promise<[AuditEventRow[], number]> {
    const total = await this.count(filter);

    if (total === 0) return [[], 0];

    const where = this.where(filter);
    const rows = await this.select(
      `${where.sql}
       ORDER BY e.occurred_at DESC, e.id DESC
       LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
      [...where.params, take, skip],
      filter.viewerOrganizationId,
    );

    return [rows, total];
  }

  async count(filter: AuditEventFilter): Promise<number> {
    const where = this.where(filter);
    const [row] = await this.query<{ total: number }>(
      `SELECT count(*)::int AS total ${FROM} ${where.sql}`,
      where.params,
    );

    return row.total;
  }

  listAll(filter: AuditEventFilter): Promise<AuditEventRow[]> {
    const where = this.where(filter);

    return this.select(
      `${where.sql} ORDER BY e.occurred_at DESC, e.id DESC`,
      where.params,
      filter.viewerOrganizationId,
    );
  }

  async findById(
    id: string,
    organizationId: string | null,
    viewerOrganizationId: string,
  ): Promise<AuditEventRow | null> {
    const [row] = await this.select(
      'WHERE e.id = $1 AND ($2::uuid IS NULL OR e.organization_id = $2::uuid)',
      [id, organizationId],
      viewerOrganizationId,
    );

    return row ?? null;
  }

  private where(filter: AuditEventFilter): { sql: string; params: unknown[] } {
    const params: unknown[] = [filter.period.from, filter.period.to];
    const conditions = [
      `e.occurred_at >= $1::date::timestamp AT TIME ZONE 'America/Sao_Paulo'`,
      `e.occurred_at < ($2::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`,
    ];
    const add = (condition: (param: string) => string, value: unknown) => {
      params.push(value);
      conditions.push(condition(`$${params.length}`));
    };

    if (filter.organizationId !== null) {
      add((p) => `e.organization_id = ${p}::uuid`, filter.organizationId);
    }
    if (filter.action) add((p) => `e.action = ${p}`, filter.action);
    if (filter.actorUserId) {
      add((p) => `e.actor_user_id = ${p}::uuid`, filter.actorUserId);
    }
    if (filter.actorType) add((p) => `e.actor_type = ${p}`, filter.actorType);
    if (filter.severity) add((p) => `(${SEVERITY}) = ${p}`, filter.severity);
    if (filter.search) {
      params.push(`%${escapeLike(filter.search.term)}%`, filter.search.actions);
      conditions.push(
        `(actor.name ILIKE $${params.length - 1} OR e.action = ANY($${params.length}::varchar[]))`,
      );
    }

    return { sql: `WHERE ${conditions.join('\n   AND ')}`, params };
  }

  private select(
    tail: string,
    params: unknown[],
    viewerOrganizationId: string,
  ): Promise<AuditEventRow[]> {
    return this.query<AuditEventRow>(
      `SELECT e.id,
              e.occurred_at AS "occurredAt",
              e.organization_id AS "organizationId",
              o.trade_name AS "organizationName",
              e.actor_type AS "actorType",
              e.actor_user_id AS "actorUserId",
              actor.name AS "actorName",
              e.actor_profile_code AS "actorProfileCode",
              e.action,
              ${SEVERITY} AS severity,
              e.entity_type AS "entityType",
              e.entity_id AS "entityId",
              ${entityLabel(`$${params.length + 1}::uuid`)} AS "entityLabel",
              host(e.ip_address) AS "ipAddress",
              e.request_id AS "requestId",
              e.before_values AS "beforeValues",
              e.after_values AS "afterValues"
         ${FROM}
         ${tail}`,
      [...params, viewerOrganizationId],
    );
  }

  private async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    try {
      return await this.dataSource.query<T[]>(sql, params);
    } catch (error) {
      throw translatePgError(error, 'audit_events');
    }
  }
}
