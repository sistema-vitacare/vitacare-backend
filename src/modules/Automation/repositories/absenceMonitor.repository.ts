import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { insertAlertNotifications } from '@/modules/Notification/repositories/alertNotification.query';
import type { FormFrequency } from '@/modules/Form/types/form.types';

import { absenceMessage } from '../policies/scheduledAlertMessage.policy';
import { absenceDueDates } from '../policies/scheduledOccurrences.policy';
import {
  ABSENCE_SEVERITY,
  ABSENCE_TITLE,
  type DispatchOutcome,
  type DueItem,
  FAR_FUTURE,
  SWEEP_OCCURRENCE_LIMIT,
} from '../types/automation.types';

/**
 * Par monitoravel (aliases `p` paciente, `f` formulario): paciente ativo,
 * formulario ativo com frequencia, aplicavel a organizacao inteira ou com o
 * paciente na lista vigente.
 */
const ELIGIBLE = `
      p.status = 'active'
  AND f.status = 'active'
  AND f.frequency_interval IS NOT NULL
  AND (f.audience = 'organization' OR EXISTS (
        SELECT 1 FROM follow_up_form_patients fp
         WHERE fp.organization_id = f.organization_id
           AND fp.form_id = f.id
           AND fp.patient_id = p.id
           AND fp.deleted_at IS NULL))`;

interface LockedMonitor {
  patientId: string;
  formId: string;
  startedAt: Date;
  checkedThrough: Date;
}

interface PairState {
  eligible: boolean;
  formName: string;
  interval: number | null;
  unit: FormFrequency['unit'] | null;
  lastSubmittedAt: Date | null;
}

/**
 * Ausencia de registro (BE-16, UC13). Estado e cursor no banco; cada par e
 * despachado numa transacao propria com `SKIP LOCKED`, e o `UNIQUE (patient_id,
 * form_id, due_at)` cobre o que escapar da trava.
 */
@Injectable()
export class AbsenceMonitorRepository {
  constructor(private readonly dataSource: DataSource) {}

  async now(): Promise<Date> {
    const [{ now }] = await this.dataSource.query<Array<{ now: Date }>>(
      'SELECT now() AS now',
    );

    return now;
  }

  async closeIneligible(now: Date): Promise<number> {
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `UPDATE follow_up_absence_monitors m
          SET status = 'ended', deleted_at = $1, updated_at = $1
        WHERE m.deleted_at IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM patients p
                  JOIN follow_up_forms f
                    ON f.organization_id = p.organization_id
                 WHERE p.organization_id = m.organization_id
                   AND p.id = m.patient_id
                   AND f.id = m.form_id
                   AND ${ELIGIBLE})`,
      [now],
    );

    return affected;
  }

  async openEligible(now: Date): Promise<number> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO follow_up_absence_monitors
         (organization_id, patient_id, form_id, started_at, checked_through)
       SELECT f.organization_id, p.id, f.id, $1, $1
         FROM follow_up_forms f
         JOIN patients p
           ON p.organization_id = f.organization_id
        WHERE ${ELIGIBLE}
          AND NOT EXISTS (
                SELECT 1 FROM follow_up_absence_monitors m
                 WHERE m.patient_id = p.id
                   AND m.form_id = f.id
                   AND m.deleted_at IS NULL)
       ON CONFLICT (patient_id, form_id) WHERE deleted_at IS NULL DO NOTHING
       RETURNING id`,
      [now],
    );

    return rows.length;
  }

  /**
   * Pares com prazo vencido (ou ainda sem calculo). Tambem voltam os pares
   * cujo prazo pode ter antecipado: formulario alterado (frequencia) ou
   * registro anulado depois da ultima conferencia.
   */
  findDue(now: Date, limit: number, exclude: string[]): Promise<DueItem[]> {
    return this.dataSource.query<DueItem[]>(
      `SELECT m.organization_id AS "organizationId", m.id
         FROM follow_up_absence_monitors m
         JOIN follow_up_forms f
           ON f.id = m.form_id
          AND f.organization_id = m.organization_id
        WHERE m.deleted_at IS NULL
          AND NOT (m.id = ANY($3::uuid[]))
          AND (m.next_due_at IS NULL
               OR m.next_due_at <= $1
               OR f.updated_at > m.updated_at
               OR EXISTS (
                    SELECT 1
                      FROM follow_up_records r
                      JOIN follow_up_responses resp
                        ON resp.record_id = r.id
                       AND resp.organization_id = r.organization_id
                     WHERE r.organization_id = m.organization_id
                       AND r.patient_id = m.patient_id
                       AND resp.form_id = m.form_id
                       AND r.status = 'annulled'
                       AND r.updated_at > m.updated_at))
        ORDER BY m.next_due_at NULLS FIRST, m.id
        LIMIT $2`,
      [now, limit, exclude],
    );
  }

  /**
   * Gera um alerta por prazo `ancora + k x frequencia` vencido em
   * `(checked_through, now]`, com `ancora = max(inicio do par, ultimo envio
   * valido)`, e avanca o cursor. Par que deixou de ser elegivel e encerrado
   * aqui, sem alerta. Bateu o limite: o cursor para no ultimo prazo gerado.
   */
  dispatch(
    organizationId: string,
    monitorId: string,
    now: Date,
  ): Promise<DispatchOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const [monitor] = await manager.query<LockedMonitor[]>(
        `SELECT patient_id AS "patientId", form_id AS "formId",
                started_at AS "startedAt", checked_through AS "checkedThrough"
           FROM follow_up_absence_monitors
          WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
          FOR UPDATE SKIP LOCKED`,
        [organizationId, monitorId],
      );

      if (!monitor) return { kind: 'skipped' };

      const state = await this.pairState(manager, organizationId, monitor, now);

      if (!state.eligible || state.interval === null || state.unit === null) {
        await manager.query(
          `UPDATE follow_up_absence_monitors
              SET status = 'ended', deleted_at = $3, updated_at = $3
            WHERE organization_id = $1 AND id = $2`,
          [organizationId, monitorId, now],
        );

        return { kind: 'skipped' };
      }

      const frequency = { interval: state.interval, unit: state.unit };
      const anchor =
        state.lastSubmittedAt && state.lastSubmittedAt > monitor.startedAt
          ? state.lastSubmittedAt
          : monitor.startedAt;
      const dueDates = absenceDueDates(
        anchor,
        frequency,
        monitor.checkedThrough,
        now,
        SWEEP_OCCURRENCE_LIMIT,
      );
      const alerts = await this.insertAlerts(manager, organizationId, monitor, {
        anchor,
        frequency,
        formName: state.formName,
        dueDates,
      });
      const cursor =
        dueDates.length === SWEEP_OCCURRENCE_LIMIT
          ? dueDates[dueDates.length - 1]
          : now;
      const [nextDue] = absenceDueDates(
        anchor,
        frequency,
        cursor,
        FAR_FUTURE,
        1,
      );

      await manager.query(
        `UPDATE follow_up_absence_monitors
            SET checked_through = greatest(checked_through, $3),
                next_due_at = $4,
                updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, monitorId, cursor, nextDue],
      );

      return { kind: 'dispatched', alerts };
    });
  }

  private async pairState(
    manager: EntityManager,
    organizationId: string,
    monitor: LockedMonitor,
    now: Date,
  ): Promise<PairState> {
    const [state] = await manager.query<PairState[]>(
      `SELECT (${ELIGIBLE}) AS eligible,
              f.name AS "formName",
              f.frequency_interval AS interval,
              f.frequency_unit AS unit,
              (SELECT max(r.created_at)
                 FROM follow_up_records r
                 JOIN follow_up_responses resp
                   ON resp.record_id = r.id
                  AND resp.organization_id = r.organization_id
                WHERE r.organization_id = f.organization_id
                  AND r.patient_id = p.id
                  AND resp.form_id = f.id
                  AND r.status = 'valid'
                  AND r.created_at <= $4) AS "lastSubmittedAt"
         FROM patients p
         JOIN follow_up_forms f
           ON f.organization_id = p.organization_id
        WHERE p.organization_id = $1
          AND p.id = $2
          AND f.id = $3`,
      [organizationId, monitor.patientId, monitor.formId, now],
    );

    return state;
  }

  private async insertAlerts(
    manager: EntityManager,
    organizationId: string,
    monitor: LockedMonitor,
    {
      anchor,
      frequency,
      formName,
      dueDates,
    }: {
      anchor: Date;
      frequency: FormFrequency;
      formName: string;
      dueDates: Date[];
    },
  ): Promise<number> {
    if (dueDates.length === 0) return 0;

    const inserted = await manager.query<Array<{ id: string; dueAt: Date }>>(
      `INSERT INTO alerts
         (organization_id, patient_id, source, form_id, title, message,
          severity, absence_since, due_at, frequency_interval, frequency_unit)
       SELECT $1, $2, 'absence', $3, $4, $5, $6, $7, due_at, $8, $9
         FROM unnest($10::timestamptz[]) AS due_at
       ON CONFLICT (patient_id, form_id, due_at) DO NOTHING
       RETURNING id, due_at AS "dueAt"`,
      [
        organizationId,
        monitor.patientId,
        monitor.formId,
        ABSENCE_TITLE,
        absenceMessage({ formName, since: anchor, frequency }),
        ABSENCE_SEVERITY,
        anchor,
        frequency.interval,
        frequency.unit,
        dueDates,
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
          source: 'absence',
          formId: monitor.formId,
          dueAt: alert.dueAt.toISOString(),
          severity: ABSENCE_SEVERITY,
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
