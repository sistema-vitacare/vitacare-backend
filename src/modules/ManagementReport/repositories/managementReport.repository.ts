import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { RequestContext } from '@/common/context/requestContext.type';
import { translatePgError } from '@/common/errors/pgError.translator';
import { escapeLike } from '@/common/sql/escapeLike';
import { inPeriod, localDay } from '@/common/sql/localPeriod';
import {
  ALERT_SEVERITIES,
  ALERT_SOURCES,
  type AlertSeverity,
  type AlertSource,
} from '@/modules/Alert/types/alert.types';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { hasPlanFeature } from '@/modules/Plan/repositories/planFeature.query';

import type {
  AlertDayRow,
  AlertSummaryRow,
  CaregiverActivityRow,
  CaregiverSummaryRow,
  GeneratedReportType,
  IntercurrenceRow,
  ManagementReportPeriod,
  ManagementReportType,
  OrganizationRef,
  RecentExportRow,
  ResolutionRow,
  StatusCounts,
  TopPatientRow,
} from '../types/managementReport.types';

/**
 * Paciente `p` que passa no filtro de condicao `$4` (trecho ja escapado, ou
 * nulo para todos): condicao principal ou qualquer secundaria, sem diferenciar
 * maiusculas (Figura 43, mesma regra de `GET /patients`).
 */
const CONDITION_MATCH = `($4::text IS NULL
   OR p.main_condition ILIKE $4 ESCAPE '\\'
   OR EXISTS (SELECT 1 FROM unnest(p.secondary_conditions) AS condition
               WHERE condition ILIKE $4 ESCAPE '\\'))`;

/** Alertas emitidos no periodo, de pacientes que passam no filtro (base do BE-22). */
const ALERTS_IN_SCOPE = `alerts a
  JOIN patients p
    ON p.id = a.patient_id
   AND p.organization_id = a.organization_id
 WHERE a.organization_id = $1
   AND ${inPeriod('a.generated_at')}
   AND ${CONDITION_MATCH}`;

const SECONDS_TO_RESOLVE = `extract(epoch FROM a.resolved_at - a.generated_at)::float8`;

const PERIOD_START = `$2::date::timestamp AT TIME ZONE 'America/Sao_Paulo'`;
const PERIOD_END = `($3::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`;

/**
 * Atividade dos cuidadores (decisao de Mateus, 2026-11-12). Entra quem teve
 * vinculo `caregiver` vigente em algum instante do periodo ou e autor de
 * registro com visita no periodo, so com pacientes que passam no filtro.
 */
const CAREGIVER_SCOPE = `WITH eligible AS (
    SELECT p.id
      FROM patients p
     WHERE p.organization_id = $1
       AND ${CONDITION_MATCH}
  ),
  links AS (
    SELECT link.user_id, link.patient_id, link.created_at, link.deleted_at
      FROM user_patients link
     WHERE link.organization_id = $1
       AND link.role = 'caregiver'
       AND link.patient_id IN (SELECT id FROM eligible)
       AND link.created_at < ${PERIOD_END}
       AND (link.deleted_at IS NULL OR link.deleted_at > ${PERIOD_START})
  ),
  records AS (
    SELECT r.author_user_id AS user_id, r.patient_id, r.status
      FROM follow_up_records r
     WHERE r.organization_id = $1
       AND ${inPeriod('r.visited_at')}
       AND r.patient_id IN (SELECT id FROM eligible)
  ),
  absences AS (
    SELECT DISTINCT l.user_id, a.id AS alert_id
      FROM alerts a
      JOIN links l
        ON l.patient_id = a.patient_id
       AND l.created_at <= a.generated_at
       AND (l.deleted_at IS NULL OR l.deleted_at > a.generated_at)
     WHERE a.organization_id = $1
       AND a.source = 'absence'
       AND ${inPeriod('a.generated_at')}
  ),
  resolved AS (
    SELECT a.resolved_by_user_id AS user_id, count(*)::int AS total
      FROM alerts a
     WHERE a.organization_id = $1
       AND a.status = 'resolved'
       AND ${inPeriod('a.resolved_at')}
       AND a.patient_id IN (SELECT id FROM eligible)
     GROUP BY a.resolved_by_user_id
  ),
  people AS (
    SELECT user_id FROM links
    UNION
    SELECT user_id FROM records
  )`;

const statusColumns = (prefix: string, filter: string) =>
  `count(*) FILTER (WHERE ${filter})::int AS "${prefix}_total",
   count(*) FILTER (WHERE ${filter} AND a.status = 'open')::int AS "${prefix}_open",
   count(*) FILTER (WHERE ${filter} AND a.status = 'resolved')::int AS "${prefix}_resolved"`;

const resolutionColumns = (prefix: string, filter: string) => {
  const resolved = `${filter} AND a.status = 'resolved'`;

  return `count(*) FILTER (WHERE ${resolved})::int AS "${prefix}_resolved_count",
   (avg(${SECONDS_TO_RESOLVE}) FILTER (WHERE ${resolved}))::float8 AS "${prefix}_avg",
   (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${SECONDS_TO_RESOLVE})
      FILTER (WHERE ${resolved}))::float8 AS "${prefix}_median"`;
};

const literal = (value: string) => `'${value}'`;

/**
 * Consultas dos relatorios gerenciais (BE-30). Toda consulta e da organizacao
 * `$1` da sessao, com o periodo `$2..$3` em dias locais e a condicao em `$4`.
 * Nunca le valor medido, referencia ou operador de alerta.
 */
@Injectable()
export class ManagementReportRepository {
  constructor(private readonly dataSource: DataSource) {}

  hasManagementReports(organizationId: string): Promise<boolean> {
    return this.read(() =>
      hasPlanFeature(
        this.dataSource.manager,
        organizationId,
        'management_reports',
      ),
    );
  }

  async organization(organizationId: string): Promise<OrganizationRef> {
    const [row] = await this.query<OrganizationRef>(
      `SELECT o.id, o.trade_name AS name FROM organizations o WHERE o.id = $1`,
      [organizationId],
    );

    return row;
  }

  async alertSummary(
    organizationId: string,
    period: ManagementReportPeriod,
    condition: string | null,
  ): Promise<AlertSummaryRow> {
    const columns = [
      statusColumns('all', 'true'),
      `count(*) FILTER (WHERE a.severity = 'critical')::int AS "intercurrences"`,
      ...ALERT_SOURCES.map((source) =>
        statusColumns(source, `a.source = ${literal(source)}`),
      ),
      ...ALERT_SEVERITIES.map((severity) =>
        statusColumns(severity, `a.severity = ${literal(severity)}`),
      ),
      resolutionColumns('all', 'true'),
      ...ALERT_SEVERITIES.map((severity) =>
        resolutionColumns(
          `res_${severity}`,
          `a.severity = ${literal(severity)}`,
        ),
      ),
    ];
    const [row] = await this.query<Record<string, number | null>>(
      `SELECT ${columns.join(',\n')} FROM ${ALERTS_IN_SCOPE}`,
      this.parameters(organizationId, period, condition),
    );

    return toAlertSummary(row);
  }

  alertsByDay(
    organizationId: string,
    period: ManagementReportPeriod,
    condition: string | null,
  ): Promise<AlertDayRow[]> {
    return this.query<AlertDayRow>(
      `SELECT ${localDay('a.generated_at')} AS date,
              count(*)::int AS total,
              count(*) FILTER (WHERE a.severity = 'critical')::int AS intercurrences
         FROM ${ALERTS_IN_SCOPE}
        GROUP BY 1
        ORDER BY 1`,
      this.parameters(organizationId, period, condition),
    );
  }

  topPatients(
    organizationId: string,
    period: ManagementReportPeriod,
    condition: string | null,
    limit: number,
  ): Promise<TopPatientRow[]> {
    return this.query<TopPatientRow>(
      `SELECT p.id, p.name, p.status,
              count(*)::int AS total,
              count(*) FILTER (WHERE a.severity = 'critical')::int AS intercurrences,
              count(*) FILTER (WHERE a.status = 'open')::int AS open
         FROM ${ALERTS_IN_SCOPE}
        GROUP BY p.id, p.name, p.status
        ORDER BY total DESC, intercurrences DESC, p.name, p.id
        LIMIT $5`,
      [...this.parameters(organizationId, period, condition), limit],
    );
  }

  /** Assunto = campo, formulario ou medicamento, nunca o valor medido. */
  intercurrences(
    organizationId: string,
    period: ManagementReportPeriod,
    condition: string | null,
    limit: number,
  ): Promise<IntercurrenceRow[]> {
    return this.query<IntercurrenceRow>(
      `SELECT a.id,
              a.generated_at AS "generatedAt",
              a.source,
              p.id AS "patientId",
              p.name AS "patientName",
              CASE a.source
                WHEN 'reading' THEN a.field_name
                WHEN 'absence' THEN f.name
                ELSE m.name
              END AS subject,
              a.status,
              a.resolved_at AS "resolvedAt",
              ${SECONDS_TO_RESOLVE} AS "secondsToResolve"
         FROM alerts a
         JOIN patients p
           ON p.id = a.patient_id
          AND p.organization_id = a.organization_id
         LEFT JOIN follow_up_forms f
           ON f.id = a.form_id
          AND f.organization_id = a.organization_id
         LEFT JOIN medications m
           ON m.id = a.medication_id
          AND m.organization_id = a.organization_id
        WHERE a.organization_id = $1
          AND ${inPeriod('a.generated_at')}
          AND ${CONDITION_MATCH}
          AND a.severity = 'critical'
        ORDER BY a.generated_at DESC, a.id DESC
        LIMIT $5`,
      [...this.parameters(organizationId, period, condition), limit],
    );
  }

  caregiverActivity(
    organizationId: string,
    period: ManagementReportPeriod,
    condition: string | null,
  ): Promise<CaregiverActivityRow[]> {
    return this.query<CaregiverActivityRow>(
      // Cada medida e agregada uma vez por usuario e juntada por chave: uma
      // subconsulta correlacionada releria as CTEs inteiras para cada linha.
      `${CAREGIVER_SCOPE},
       linked AS (
         SELECT user_id, count(DISTINCT patient_id)::int AS total
           FROM links
          GROUP BY user_id
       ),
       authored AS (
         SELECT user_id,
                count(*) FILTER (WHERE status = 'valid')::int AS valid,
                count(*) FILTER (WHERE status = 'annulled')::int AS annulled
           FROM records
          GROUP BY user_id
       ),
       covered AS (
         SELECT l.user_id, count(DISTINCT l.patient_id)::int AS total
           FROM links l
           JOIN (SELECT DISTINCT user_id, patient_id
                   FROM records
                  WHERE status = 'valid') r
             ON r.user_id = l.user_id
            AND r.patient_id = l.patient_id
          GROUP BY l.user_id
       ),
       absent AS (
         SELECT user_id, count(*)::int AS total
           FROM absences
          GROUP BY user_id
       )
       SELECT u.id, u.name, u.status, ap.code AS profile,
              COALESCE(linked.total, 0) AS "linkedPatients",
              COALESCE(authored.valid, 0) AS "validFollowUps",
              COALESCE(authored.annulled, 0) AS "annulledFollowUps",
              COALESCE(covered.total, 0) AS "patientsWithFollowUp",
              COALESCE(absent.total, 0) AS "absenceAlerts",
              COALESCE(resolved.total, 0) AS "resolvedAlerts"
         FROM people
         JOIN users u
           ON u.id = people.user_id
          AND u.organization_id = $1
         JOIN access_profiles ap
           ON ap.id = u.profile_id
         LEFT JOIN linked ON linked.user_id = u.id
         LEFT JOIN authored ON authored.user_id = u.id
         LEFT JOIN covered ON covered.user_id = u.id
         LEFT JOIN absent ON absent.user_id = u.id
         LEFT JOIN resolved ON resolved.user_id = u.id
        ORDER BY u.name, u.id`,
      this.parameters(organizationId, period, condition),
    );
  }

  /** Distintos da organizacao: um paciente ou alerta conta uma vez. */
  async caregiverSummary(
    organizationId: string,
    period: ManagementReportPeriod,
    condition: string | null,
  ): Promise<CaregiverSummaryRow> {
    const [row] = await this.query<CaregiverSummaryRow>(
      `${CAREGIVER_SCOPE}
       SELECT (SELECT count(DISTINCT patient_id) FROM links)::int AS "linkedPatients",
              (SELECT count(DISTINCT alert_id) FROM absences)::int AS "absenceAlerts"`,
      this.parameters(organizationId, period, condition),
    );

    return row;
  }

  /** "N gerados" da Figura 43: exportacoes auditadas de cada tipo. */
  async exportCounts(
    organizationId: string,
  ): Promise<Record<ManagementReportType, number>> {
    const rows = await this.query<{
      type: ManagementReportType;
      total: number;
    }>(
      `SELECT CASE e.action
                WHEN 'patient_report.exported' THEN 'patient_follow_up'
                ELSE e.after_values->>'type'
              END AS type,
              count(*)::int AS total
         FROM audit_events e
        WHERE e.organization_id = $1
          AND e.action IN ('patient_report.exported', 'management_report.exported')
        GROUP BY 1`,
      [organizationId],
    );
    const counts: Record<ManagementReportType, number> = {
      patient_follow_up: 0,
      alerts: 0,
      caregiver_activity: 0,
    };

    for (const row of rows) {
      if (row.type in counts) counts[row.type] = row.total;
    }

    return counts;
  }

  /** Recentes = exportacoes auditadas; a leitura em JSON nao e auditada. */
  async recentExports(
    organizationId: string,
    page: number,
    limit: number,
  ): Promise<{ rows: RecentExportRow[]; total: number }> {
    const scope = `FROM audit_events e
      WHERE e.organization_id = $1
        AND e.action IN ('patient_report.exported', 'management_report.exported')`;
    const [rows, [count]] = await Promise.all([
      this.query<RecentExportRow>(
        `SELECT e.id,
                CASE e.action
                  WHEN 'patient_report.exported' THEN 'patient_follow_up'
                  ELSE e.after_values->>'type'
                END AS type,
                p.id AS "patientId",
                p.name AS "patientName",
                e.after_values->>'condition' AS condition,
                e.after_values->>'from' AS "from",
                e.after_values->>'to' AS "to",
                actor.id AS "actorId",
                actor.name AS "actorName",
                e.occurred_at AS "occurredAt"
           FROM audit_events e
           LEFT JOIN patients p
             ON e.action = 'patient_report.exported'
            AND p.id = e.entity_id
            AND p.organization_id = e.organization_id
           LEFT JOIN users actor
             ON actor.id = e.actor_user_id
            AND actor.organization_id = e.organization_id
          WHERE e.organization_id = $1
            AND e.action IN ('patient_report.exported', 'management_report.exported')
          ORDER BY e.occurred_at DESC, e.id DESC
          LIMIT $2 OFFSET $3`,
        [organizationId, limit, (page - 1) * limit],
      ),
      this.query<{ total: number }>(`SELECT count(*)::int AS total ${scope}`, [
        organizationId,
      ]),
    ]);

    return { rows, total: count.total };
  }

  /** Sem dado clinico nem nome: tipo, formato, periodo e a condicao do escopo. */
  async recordExport(
    ctx: RequestContext,
    type: GeneratedReportType,
    period: ManagementReportPeriod,
    condition: string | null,
  ): Promise<void> {
    await this.read(() =>
      insertAuditEvent(this.dataSource.manager, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'management_report.exported',
        entityType: 'organization',
        entityId: ctx.organizationId,
        afterValues: {
          type,
          format: 'pdf',
          from: period.from,
          to: period.to,
          condition,
        },
        requestId: ctx.requestId,
      }),
    );
  }

  private parameters(
    organizationId: string,
    period: ManagementReportPeriod,
    condition: string | null,
  ): unknown[] {
    return [
      organizationId,
      period.from,
      period.to,
      condition ? `%${escapeLike(condition)}%` : null,
    ];
  }

  private query<T>(sql: string, parameters: unknown[]): Promise<T[]> {
    return this.read(() => this.dataSource.query<T[]>(sql, parameters));
  }

  private async read<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw translatePgError(error, 'management_reports');
    }
  }
}

const statusOf = (
  row: Record<string, number | null>,
  prefix: string,
): StatusCounts => ({
  total: row[`${prefix}_total`] ?? 0,
  open: row[`${prefix}_open`] ?? 0,
  resolved: row[`${prefix}_resolved`] ?? 0,
});

const resolutionOf = (
  row: Record<string, number | null>,
  prefix: string,
): ResolutionRow => ({
  resolved: row[`${prefix}_resolved_count`] ?? 0,
  averageSeconds: row[`${prefix}_avg`] ?? null,
  medianSeconds: row[`${prefix}_median`] ?? null,
});

const toAlertSummary = (
  row: Record<string, number | null>,
): AlertSummaryRow => ({
  totals: { ...statusOf(row, 'all'), intercurrences: row.intercurrences ?? 0 },
  bySource: Object.fromEntries(
    ALERT_SOURCES.map((source) => [source, statusOf(row, source)]),
  ) as Record<AlertSource, StatusCounts>,
  bySeverity: Object.fromEntries(
    ALERT_SEVERITIES.map((severity) => [severity, statusOf(row, severity)]),
  ) as Record<AlertSeverity, StatusCounts>,
  resolution: {
    ...resolutionOf(row, 'all'),
    bySeverity: Object.fromEntries(
      ALERT_SEVERITIES.map((severity) => [
        severity,
        resolutionOf(row, `res_${severity}`),
      ]),
    ) as Record<AlertSeverity, ResolutionRow>,
  },
});
