import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { insertAlertNotifications } from '@/modules/Notification/repositories/alertNotification.query';
import type { FrequencyUnit } from '@/modules/Form/types/form.types';
import { findPatientInScope } from '@/modules/PatientAccess/repositories/patientAccess.query';
import { PATIENT_SCOPE_WHERE } from '@/modules/Patient/repositories/patientScope.query';

import { alertMessage } from '../policies/alertMessage.policy';
import type {
  AlertMatch,
  AlertRow,
  AlertScope,
  EvaluateRecordOutcome,
  ListAlertsFilter,
  ListAlertsOutcome,
  ResolveAlertOutcome,
} from '../types/alert.types';

/**
 * Alertas de pacientes do alcance `$1`..`$3` (alias `a`), com a notificacao
 * do proprio usuario `$4` (`own`) e quem resolveu.
 */
const ALERT_FROM = `
    FROM alerts a
    JOIN patients p
      ON p.id = a.patient_id
     AND p.organization_id = a.organization_id
    LEFT JOIN alert_rules ar
      ON ar.id = a.rule_id
     AND ar.organization_id = a.organization_id
    LEFT JOIN follow_up_records r
      ON r.id = a.follow_up_record_id
     AND r.organization_id = a.organization_id
    LEFT JOIN follow_up_forms f
      ON f.id = a.form_id
     AND f.organization_id = a.organization_id
    LEFT JOIN medications m
      ON m.id = a.medication_id
     AND m.organization_id = a.organization_id
    LEFT JOIN users resolver
      ON resolver.id = a.resolved_by_user_id
     AND resolver.organization_id = a.organization_id
    LEFT JOIN alert_notifications own
      ON own.alert_id = a.id
     AND own.organization_id = a.organization_id
     AND own.user_id = $4
  ${PATIENT_SCOPE_WHERE}`;

const ALERT_SELECT = `
  SELECT a.id,
         p.id AS "patientId",
         p.name AS "patientName",
         a.source,
         a.severity,
         a.status,
         a.title,
         a.message,
         ar.id AS "ruleId",
         ar.name AS "ruleName",
         r.id AS "followUpId",
         r.visited_at AS "visitedAt",
         r.status AS "followUpStatus",
         a.field_key AS "fieldKey",
         a.field_name AS "fieldName",
         a.field_unit AS "fieldUnit",
         a.value,
         a.operator,
         a.reference_value AS "referenceValue",
         f.id AS "formId",
         f.name AS "formName",
         a.absence_since AS "absenceSince",
         a.due_at AS "dueAt",
         a.frequency_interval AS "frequencyInterval",
         a.frequency_unit AS "frequencyUnit",
         m.id AS "medicationId",
         m.name AS "medicationName",
         a.medication_reminder_id AS "medicationReminderId",
         a.scheduled_at AS "scheduledAt",
         a.generated_at AS "generatedAt",
         a.resolved_at AS "resolvedAt",
         resolver.id AS "resolvedById",
         resolver.name AS "resolvedByName",
         own.id AS "notificationId",
         own.read_at AS "readAt"
  ${ALERT_FROM}`;

type RawAlertRow = Pick<
  AlertRow,
  | 'id'
  | 'source'
  | 'severity'
  | 'status'
  | 'title'
  | 'message'
  | 'value'
  | 'operator'
  | 'generatedAt'
> & {
  patientId: string;
  patientName: string;
  ruleId: string | null;
  ruleName: string | null;
  followUpId: string | null;
  visitedAt: Date | null;
  followUpStatus: string | null;
  fieldKey: string | null;
  fieldName: string | null;
  fieldUnit: string | null;
  referenceValue: string | null;
  formId: string | null;
  formName: string | null;
  absenceSince: Date | null;
  dueAt: Date | null;
  frequencyInterval: number | null;
  frequencyUnit: FrequencyUnit | null;
  medicationId: string | null;
  medicationName: string | null;
  medicationReminderId: string | null;
  scheduledAt: Date | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  resolvedByName: string | null;
  notificationId: string | null;
  readAt: Date | null;
};

const scopeParameters = (scope: AlertScope): unknown[] => [
  scope.organizationId,
  scope.viewerUserId,
  scope.viewerLinkRoles,
  scope.viewerId,
];

/** Cada origem preenche so o proprio bloco; os demais saem nulos. */
const toRow = (raw: RawAlertRow): AlertRow => {
  const reading = raw.source === 'reading';

  return {
    id: raw.id,
    patient: { id: raw.patientId, name: raw.patientName },
    source: raw.source,
    severity: raw.severity,
    status: raw.status,
    title: raw.title,
    message: raw.message,
    rule: reading ? { id: raw.ruleId!, name: raw.ruleName! } : null,
    followUp: reading
      ? {
          id: raw.followUpId!,
          visitedAt: raw.visitedAt!,
          status: raw.followUpStatus!,
        }
      : null,
    field: reading
      ? { key: raw.fieldKey!, name: raw.fieldName!, unit: raw.fieldUnit }
      : null,
    value: raw.value,
    operator: raw.operator,
    referenceValue:
      raw.referenceValue === null ? null : Number(raw.referenceValue),
    absence:
      raw.source === 'absence'
        ? {
            form: { id: raw.formId!, name: raw.formName! },
            since: raw.absenceSince!,
            dueAt: raw.dueAt!,
            frequency: {
              interval: raw.frequencyInterval!,
              unit: raw.frequencyUnit!,
            },
          }
        : null,
    medicationReminder:
      raw.source === 'medication_reminder'
        ? {
            medication: { id: raw.medicationId!, name: raw.medicationName! },
            reminderId: raw.medicationReminderId!,
            scheduledAt: raw.scheduledAt!,
          }
        : null,
    generatedAt: raw.generatedAt,
    resolution:
      raw.resolvedAt === null
        ? null
        : {
            resolvedAt: raw.resolvedAt,
            resolvedBy: { id: raw.resolvedById!, name: raw.resolvedByName! },
          },
    notification:
      raw.notificationId === null
        ? null
        : { id: raw.notificationId, readAt: raw.readAt },
  };
};

/**
 * Itens numericos do registro `$2` contra as regras ativas do formulario
 * respondido criadas ate o envio (`rec.created_at`, comparado no banco para
 * nao perder os microssegundos). Regra propria ativa do paciente num campo
 * substitui as gerais desse campo (decisao de 2026-11-05). O `CASE` so
 * converte o texto para `numeric` em campo numerico; a comparacao e exata,
 * sem ponto flutuante.
 */
const MATCHES = `
  SELECT ar.id AS "ruleId",
         ar.name AS "ruleName",
         ar.severity,
         ar.operator,
         ar.reference_value::text AS "referenceValue",
         i.id AS "responseItemId",
         ff.field_key AS "fieldKey",
         ff.name AS "fieldName",
         ff.unit AS "fieldUnit",
         i.value
    FROM follow_up_records rec
    JOIN follow_up_responses resp
      ON resp.record_id = rec.id
     AND resp.organization_id = rec.organization_id
    JOIN follow_up_response_items i
      ON i.response_id = resp.id
     AND i.organization_id = resp.organization_id
    JOIN follow_up_form_fields ff
      ON ff.id = i.field_id
     AND ff.organization_id = i.organization_id
    JOIN alert_rules ar
      ON ar.organization_id = resp.organization_id
     AND ar.form_id = resp.form_id
     AND ar.field_key = ff.field_key
     AND ar.status = 'active'
     AND ar.created_at <= rec.created_at
     AND (ar.patient_id = rec.patient_id
          OR (ar.patient_id IS NULL AND NOT EXISTS (
                SELECT 1 FROM alert_rules own
                 WHERE own.organization_id = ar.organization_id
                   AND own.form_id = ar.form_id
                   AND own.field_key = ar.field_key
                   AND own.patient_id = rec.patient_id
                   AND own.status = 'active'
                   AND own.created_at <= rec.created_at)))
   WHERE rec.organization_id = $1
     AND rec.id = $2
     AND CASE
           WHEN ff.field_type NOT IN ('number', 'scale') THEN false
           WHEN ar.operator = 'gt' THEN i.value::numeric > ar.reference_value
           WHEN ar.operator = 'gte' THEN i.value::numeric >= ar.reference_value
           WHEN ar.operator = 'lt' THEN i.value::numeric < ar.reference_value
           WHEN ar.operator = 'lte' THEN i.value::numeric <= ar.reference_value
           ELSE false
         END
   ORDER BY ff.position, ar.created_at, ar.id`;

const MESSAGE_MAX_LENGTH = 500;

/** Corta por caractere (nao por unidade UTF-16) para nao partir um emoji. */
const truncate = (text: string, max: number): string => {
  const chars = Array.from(text);

  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
};

/** Pausa da varredura para um registro cuja avaliacao falhou. */
const FAILED_RETRY_SECONDS = 3600;

/**
 * Alertas (UC13, RF014). A leitura segue o alcance de pacientes; a avaliacao
 * e de sistema e recebe a organizacao de quem a disparou ou da varredura.
 */
@Injectable()
export class AlertRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(
    scope: AlertScope,
    filter: ListAlertsFilter,
  ): Promise<ListAlertsOutcome> {
    try {
      const manager = this.dataSource.manager;

      if (!(await findPatientInScope(manager, scope, filter.patientId))) {
        return { kind: 'patient_not_found' };
      }

      const where = `
          AND a.patient_id = $5
          AND ($6::varchar IS NULL OR a.severity = $6)
          AND ($7::varchar IS NULL OR a.status = $7)`;
      const parameters = [
        ...scopeParameters(scope),
        filter.patientId,
        filter.severity ?? null,
        filter.status ?? null,
      ];

      const [rows, [{ total }]] = await Promise.all([
        manager.query<RawAlertRow[]>(
          `${ALERT_SELECT} ${where}
            ORDER BY a.generated_at DESC, a.id
            LIMIT $8 OFFSET $9`,
          [...parameters, filter.take, filter.skip],
        ),
        manager.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total ${ALERT_FROM} ${where}`,
          parameters,
        ),
      ]);

      return { kind: 'ok', items: rows.map(toRow), total };
    } catch (error) {
      throw translatePgError(error, 'alerts');
    }
  }

  async findById(scope: AlertScope, alertId: string): Promise<AlertRow | null> {
    try {
      return await this.findInScope(this.dataSource.manager, scope, alertId);
    } catch (error) {
      throw translatePgError(error, 'alerts');
    }
  }

  /**
   * Resolve o alerta para todos (Figura 42), guardando autor e data, no
   * alcance de pacientes de quem resolve. Nao ha desfazer.
   */
  async resolve(
    scope: AlertScope,
    alertId: string,
    requestId: string,
  ): Promise<ResolveAlertOutcome> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const [current] = await manager.query<Array<{ status: string }>>(
          `SELECT a.status
             FROM alerts a
             JOIN patients p
               ON p.id = a.patient_id
              AND p.organization_id = a.organization_id
           ${PATIENT_SCOPE_WHERE}
              AND a.id = $4
              FOR UPDATE OF a`,
          [
            scope.organizationId,
            scope.viewerUserId,
            scope.viewerLinkRoles,
            alertId,
          ],
        );

        if (!current) return { kind: 'not_found' };
        if (current.status === 'resolved') return { kind: 'already_resolved' };

        await manager.query(
          `UPDATE alerts
              SET status = 'resolved',
                  resolved_at = now(),
                  resolved_by_user_id = $3,
                  updated_at = now()
            WHERE organization_id = $1 AND id = $2`,
          [scope.organizationId, alertId, scope.viewerId],
        );
        await insertAuditEvent(manager, {
          organizationId: scope.organizationId,
          actorUserId: scope.viewerId,
          action: 'alert.resolved',
          entityType: 'alert',
          entityId: alertId,
          afterValues: { status: 'resolved' },
          requestId,
        });

        return {
          kind: 'resolved',
          alert: (await this.findInScope(manager, scope, alertId))!,
        };
      });
    } catch (error) {
      throw translatePgError(error, 'alerts');
    }
  }

  private async findInScope(
    manager: EntityManager,
    scope: AlertScope,
    alertId: string,
  ): Promise<AlertRow | null> {
    const [row] = await manager.query<RawAlertRow[]>(
      `${ALERT_SELECT} AND a.id = $5`,
      [...scopeParameters(scope), alertId],
    );

    return row ? toRow(row) : null;
  }

  /**
   * Avalia um registro uma unica vez: trava o registro ainda nao avaliado com
   * `SKIP LOCKED` (outra avaliacao em curso = `skipped`), grava os alertas e
   * marca `alerts_evaluated_at` na mesma transacao. O `UNIQUE (rule_id,
   * response_item_id)` cobre qualquer repeticao que escape da trava. Registro
   * anulado antes da avaliacao so e marcado.
   */
  async evaluateRecord(
    organizationId: string,
    followUpId: string,
  ): Promise<EvaluateRecordOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const [record] = await manager.query<
        Array<{ patientId: string; status: string }>
      >(
        `SELECT patient_id AS "patientId", status
           FROM follow_up_records
          WHERE organization_id = $1
            AND id = $2
            AND alerts_evaluated_at IS NULL
          FOR UPDATE SKIP LOCKED`,
        [organizationId, followUpId],
      );

      if (!record) return { kind: 'skipped' };

      const matches =
        record.status === 'valid'
          ? await manager.query<AlertMatch[]>(MATCHES, [
              organizationId,
              followUpId,
            ])
          : [];
      const created = await this.insertAlerts(
        manager,
        organizationId,
        followUpId,
        record.patientId,
        matches,
      );

      await manager.query(
        `UPDATE follow_up_records
            SET alerts_evaluated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, followUpId],
      );

      return { kind: 'evaluated', alerts: created };
    });
  }

  /**
   * Registros que a avaliacao logo apos o envio nao concluiu. Os que ja
   * falharam na varredura esperam `FAILED_RETRY_SECONDS` e vao para o fim da
   * fila, para um registro com falha permanente nao travar os demais.
   */
  async findPendingRecords(
    olderThanSeconds: number,
    limit: number,
  ): Promise<Array<{ organizationId: string; id: string }>> {
    return this.dataSource.manager.query(
      `SELECT organization_id AS "organizationId", id
         FROM follow_up_records
        WHERE alerts_evaluated_at IS NULL
          AND created_at < now() - make_interval(secs => $1)
          AND (alerts_evaluation_failed_at IS NULL
               OR alerts_evaluation_failed_at < now() - make_interval(secs => $3))
        ORDER BY alerts_evaluation_failed_at NULLS FIRST, created_at
        LIMIT $2`,
      [olderThanSeconds, limit, FAILED_RETRY_SECONDS],
    );
  }

  async markEvaluationFailed(
    organizationId: string,
    followUpId: string,
  ): Promise<void> {
    await this.dataSource.manager.query(
      `UPDATE follow_up_records
          SET alerts_evaluation_failed_at = now()
        WHERE organization_id = $1
          AND id = $2
          AND alerts_evaluated_at IS NULL`,
      [organizationId, followUpId],
    );
  }

  private async insertAlerts(
    manager: EntityManager,
    organizationId: string,
    followUpId: string,
    patientId: string,
    matches: AlertMatch[],
  ): Promise<number> {
    if (matches.length === 0) return 0;

    const inserted = await manager.query<
      Array<{ id: string; ruleId: string; severity: string }>
    >(
      `INSERT INTO alerts
         (organization_id, patient_id, source, rule_id, follow_up_record_id,
          response_item_id, title, message, severity, field_key, field_name,
          field_unit, value, operator, reference_value)
       SELECT $1, $2, 'reading', x.rule_id, $3, x.response_item_id, x.title,
              x.message, x.severity, x.field_key, x.field_name, x.field_unit,
              x.value, x.operator, x.reference_value
         FROM jsonb_to_recordset($4::jsonb) AS x(
                rule_id uuid, response_item_id uuid, title text, message text,
                severity text, field_key uuid, field_name text, field_unit text,
                value text, operator text, reference_value numeric)
       ON CONFLICT (rule_id, response_item_id) DO NOTHING
       RETURNING id, rule_id AS "ruleId", severity`,
      [
        organizationId,
        patientId,
        followUpId,
        JSON.stringify(
          matches.map((match) => ({
            rule_id: match.ruleId,
            response_item_id: match.responseItemId,
            title: match.ruleName,
            message: truncate(alertMessage(match), MESSAGE_MAX_LENGTH),
            severity: match.severity,
            field_key: match.fieldKey,
            field_name: match.fieldName,
            field_unit: match.fieldUnit,
            value: match.value,
            operator: match.operator,
            reference_value: match.referenceValue,
          })),
        ),
      ],
    );

    for (const alert of inserted) {
      await insertAuditEvent(manager, {
        organizationId,
        actorUserId: null,
        action: 'alert.generated',
        entityType: 'alert',
        entityId: alert.id,
        afterValues: {
          ruleId: alert.ruleId,
          followUpId,
          severity: alert.severity,
        },
        requestId: null,
      });
    }

    await insertAlertNotifications(
      manager,
      organizationId,
      inserted.map((alert) => alert.id),
    );

    return inserted.length;
  }
}
