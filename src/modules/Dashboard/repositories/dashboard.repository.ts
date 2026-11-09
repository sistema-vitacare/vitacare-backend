import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';
import {
  ALERT_SEVERITIES,
  ALERT_SOURCES,
  type AlertSeverity,
  type AlertSource,
} from '@/modules/Alert/types/alert.types';
import { TENANT_PROFILE_CODES } from '@/modules/Access/access.permissions';
import { hasPlanFeature } from '@/modules/Plan/repositories/planFeature.query';

import type {
  AlertsIssuedBreakdown,
  CountByRef,
  DashboardPeriod,
  DayCount,
  LatestFollowUpRow,
  PatientCounts,
  PendingAlerts,
  PriorityAlertRow,
  UsersByProfileRow,
} from '../types/dashboard.types';

/** Dias locais inclusivos `$2..$3`, na forma que usa o indice por instante. */
const inPeriod = (column: string) =>
  `${column} >= $2::date::timestamp AT TIME ZONE 'America/Sao_Paulo'
   AND ${column} < ($3::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`;

const localDay = (column: string) =>
  `to_char((${column} AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD')`;

const countBy = <K extends string>(
  keys: readonly K[],
  filter: (key: K) => string,
) =>
  keys
    .map((key) => `count(*) FILTER (WHERE ${filter(key)})::int AS "${key}"`)
    .join(',\n');

const SEVERITY_RANK = `CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`;

/**
 * Agregados do painel operacional (UC05, Figura 33). Toda consulta e da
 * organizacao `$1` da sessao; registro conta so se valido, pela data da
 * visita; alerta conta em qualquer status, pela data de geracao.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly dataSource: DataSource) {}

  hasDashboard(organizationId: string): Promise<boolean> {
    return this.read(() =>
      hasPlanFeature(
        this.dataSource.manager,
        organizationId,
        'operational_dashboard',
      ),
    );
  }

  async countFollowUps(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<number> {
    const [row] = await this.query<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM follow_up_records r
        WHERE r.organization_id = $1
          AND r.status = 'valid'
          AND ${inPeriod('r.visited_at')}`,
      [organizationId, period.from, period.to],
    );

    return row.total;
  }

  followUpsByDay(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<DayCount[]> {
    return this.query<DayCount>(
      `SELECT ${localDay('r.visited_at')} AS date, count(*)::int AS total
         FROM follow_up_records r
        WHERE r.organization_id = $1
          AND r.status = 'valid'
          AND ${inPeriod('r.visited_at')}
        GROUP BY 1`,
      [organizationId, period.from, period.to],
    );
  }

  followUpsByForm(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<CountByRef[]> {
    return this.query<CountByRef>(
      `SELECT f.id, f.name, count(*)::int AS total
         FROM follow_up_records r
         JOIN follow_up_responses resp
           ON resp.record_id = r.id
          AND resp.organization_id = r.organization_id
         JOIN follow_up_forms f
           ON f.id = resp.form_id
          AND f.organization_id = resp.organization_id
        WHERE r.organization_id = $1
          AND r.status = 'valid'
          AND ${inPeriod('r.visited_at')}
        GROUP BY f.id, f.name
        ORDER BY total DESC, f.name, f.id`,
      [organizationId, period.from, period.to],
    );
  }

  followUpsByAuthor(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<CountByRef[]> {
    return this.query<CountByRef>(
      `SELECT u.id, u.name, count(*)::int AS total
         FROM follow_up_records r
         JOIN users u
           ON u.id = r.author_user_id
          AND u.organization_id = r.organization_id
        WHERE r.organization_id = $1
          AND r.status = 'valid'
          AND ${inPeriod('r.visited_at')}
        GROUP BY u.id, u.name
        ORDER BY total DESC, u.name, u.id`,
      [organizationId, period.from, period.to],
    );
  }

  latestFollowUps(
    organizationId: string,
    period: DashboardPeriod,
    limit: number,
  ): Promise<LatestFollowUpRow[]> {
    return this.query<LatestFollowUpRow>(
      `SELECT r.id,
              p.id AS "patientId",
              p.name AS "patientName",
              f.id AS "formId",
              f.name AS "formName",
              u.id AS "authorId",
              u.name AS "authorName",
              r.visited_at AS "visitedAt"
         FROM follow_up_records r
         JOIN patients p
           ON p.id = r.patient_id
          AND p.organization_id = r.organization_id
         JOIN follow_up_responses resp
           ON resp.record_id = r.id
          AND resp.organization_id = r.organization_id
         JOIN follow_up_forms f
           ON f.id = resp.form_id
          AND f.organization_id = resp.organization_id
         JOIN users u
           ON u.id = r.author_user_id
          AND u.organization_id = r.organization_id
        WHERE r.organization_id = $1
          AND r.status = 'valid'
          AND ${inPeriod('r.visited_at')}
        ORDER BY r.visited_at DESC, r.created_at DESC, r.id
        LIMIT $4`,
      [organizationId, period.from, period.to, limit],
    );
  }

  async countAlertsIssued(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<number> {
    const [row] = await this.query<{ total: number }>(
      `SELECT count(*)::int AS total
         FROM alerts a
        WHERE a.organization_id = $1
          AND ${inPeriod('a.generated_at')}`,
      [organizationId, period.from, period.to],
    );

    return row.total;
  }

  async alertsIssuedBreakdown(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<AlertsIssuedBreakdown> {
    const parameters = [organizationId, period.from, period.to];
    const [byDay, [totals]] = await Promise.all([
      this.query<DayCount>(
        `SELECT ${localDay('a.generated_at')} AS date, count(*)::int AS total
           FROM alerts a
          WHERE a.organization_id = $1
            AND ${inPeriod('a.generated_at')}
          GROUP BY 1`,
        parameters,
      ),
      this.query<Record<string, number>>(
        `SELECT ${countBy(ALERT_SEVERITIES, (s) => `a.severity = '${s}'`)},
                ${countBy(ALERT_SOURCES, (s) => `a.source = '${s}'`)},
                count(*) FILTER (WHERE a.status = 'open')::int AS "stillOpen"
           FROM alerts a
          WHERE a.organization_id = $1
            AND ${inPeriod('a.generated_at')}`,
        parameters,
      ),
    ]);

    return {
      byDay,
      bySeverity: pick(totals, ALERT_SEVERITIES),
      bySource: pick(totals, ALERT_SOURCES),
      stillOpen: totals.stillOpen,
    };
  }

  async pendingAlerts(organizationId: string): Promise<PendingAlerts> {
    const [totals] = await this.query<Record<string, number>>(
      `SELECT count(*)::int AS total,
              ${countBy(ALERT_SEVERITIES, (s) => `a.severity = '${s}'`)}
         FROM alerts a
        WHERE a.organization_id = $1
          AND a.status = 'open'`,
      [organizationId],
    );

    return {
      total: totals.total,
      bySeverity: pick(totals, ALERT_SEVERITIES),
    };
  }

  /** Abertos, do mais grave para o menos grave e depois os mais recentes. */
  priorityAlerts(
    organizationId: string,
    limit: number,
  ): Promise<PriorityAlertRow[]> {
    return this.query<PriorityAlertRow>(
      `SELECT a.id,
              p.id AS "patientId",
              p.name AS "patientName",
              a.source,
              a.severity,
              a.title,
              a.generated_at AS "generatedAt",
              a.field_name AS "fieldName",
              a.field_unit AS "fieldUnit",
              a.value,
              a.operator,
              a.reference_value::text AS "referenceValue",
              u.id AS "authorId",
              u.name AS "authorName"
         FROM alerts a
         JOIN patients p
           ON p.id = a.patient_id
          AND p.organization_id = a.organization_id
         LEFT JOIN follow_up_records r
           ON r.id = a.follow_up_record_id
          AND r.organization_id = a.organization_id
         LEFT JOIN users u
           ON u.id = r.author_user_id
          AND u.organization_id = r.organization_id
        WHERE a.organization_id = $1
          AND a.status = 'open'
        ORDER BY ${SEVERITY_RANK}, a.generated_at DESC, a.id
        LIMIT $2`,
      [organizationId, limit],
    );
  }

  async patientCounts(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<PatientCounts> {
    const [row] = await this.query<PatientCounts>(
      `SELECT count(*) FILTER (WHERE p.status = 'active')::int AS active,
              count(*) FILTER (WHERE p.status = 'inactive')::int AS inactive,
              count(*) FILTER (WHERE ${inPeriod('p.created_at')})::int AS "newInPeriod"
         FROM patients p
        WHERE p.organization_id = $1`,
      [organizationId, period.from, period.to],
    );

    return row;
  }

  /** Pacientes ativos pelo profissional responsavel vigente. */
  patientsByResponsible(organizationId: string): Promise<CountByRef[]> {
    return this.query<CountByRef>(
      `SELECT u.id, u.name, count(*)::int AS total
         FROM patients p
         JOIN user_patients link
           ON link.patient_id = p.id
          AND link.organization_id = p.organization_id
          AND link.role = 'responsible_professional'
          AND link.deleted_at IS NULL
         JOIN users u
           ON u.id = link.user_id
          AND u.organization_id = link.organization_id
        WHERE p.organization_id = $1
          AND p.status = 'active'
        GROUP BY u.id, u.name
        ORDER BY total DESC, u.name, u.id`,
      [organizationId],
    );
  }

  /** Os quatro perfis de tenant, sempre presentes, na ordem da matriz. */
  usersByProfile(organizationId: string): Promise<UsersByProfileRow[]> {
    return this.query<UsersByProfileRow>(
      `SELECT ap.code,
              ap.name,
              count(u.id) FILTER (WHERE u.status = 'active')::int AS active,
              count(u.id) FILTER (WHERE u.status = 'pending')::int AS pending,
              count(u.id) FILTER (WHERE u.status = 'inactive')::int AS inactive
         FROM access_profiles ap
         LEFT JOIN users u
           ON u.profile_id = ap.id
          AND u.organization_id = ap.organization_id
        WHERE ap.organization_id = $1
          AND ap.code = ANY ($2::text[])
        GROUP BY ap.code, ap.name
        ORDER BY array_position($2::text[], ap.code::text)`,
      [organizationId, TENANT_PROFILE_CODES],
    );
  }

  private query<T>(sql: string, parameters: unknown[]): Promise<T[]> {
    return this.read(() => this.dataSource.query<T[]>(sql, parameters));
  }

  private async read<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw translatePgError(error, 'dashboard');
    }
  }
}

const pick = <K extends AlertSeverity | AlertSource>(
  totals: Record<string, number>,
  keys: readonly K[],
): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, totals[key]])) as Record<
    K,
    number
  >;
