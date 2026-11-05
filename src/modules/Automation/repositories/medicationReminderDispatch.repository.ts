import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import type { MedicationDoseUnit } from '@/modules/Medication/types/medication.types';

import { reminderMessage } from '../policies/scheduledAlertMessage.policy';
import { reminderOccurrences } from '../policies/scheduledOccurrences.policy';
import {
  type DispatchOutcome,
  type DueItem,
  REMINDER_SEVERITY,
  REMINDER_TITLE,
  SWEEP_OCCURRENCE_LIMIT,
} from '../types/automation.types';

interface LockedReminder {
  medicationId: string;
  patientId: string;
  patientStatus: string;
  medicationName: string;
  doseAmount: string;
  doseUnit: MedicationDoseUnit;
  startDate: string;
  endDate: string | null;
  intervalDays: number;
  timeOfDay: string;
  cursor: Date;
}

/**
 * Lembretes de medicamento (BE-16, UC13). Le so linhas vigentes da agenda de
 * medicamento ativo com lembretes: editar ou inativar encerra a linha e
 * cancela o que ela ainda nao gerou. O cursor `dispatched_through` e o
 * `UNIQUE (medication_reminder_id, scheduled_at)` impedem repeticao.
 */
@Injectable()
export class MedicationReminderDispatchRepository {
  constructor(private readonly dataSource: DataSource) {}

  async now(): Promise<Date> {
    const [{ now }] = await this.dataSource.query<Array<{ now: Date }>>(
      'SELECT now() AS now',
    );

    return now;
  }

  findDue(now: Date, limit: number, exclude: string[]): Promise<DueItem[]> {
    return this.dataSource.query<DueItem[]>(
      `SELECT r.organization_id AS "organizationId", r.id
         FROM medication_reminders r
         JOIN medications m
           ON m.id = r.medication_id
          AND m.organization_id = r.organization_id
        WHERE r.deleted_at IS NULL
          AND m.status = 'active'
          AND m.reminders_enabled
          AND coalesce(r.dispatched_through, r.created_at) < $1
          AND NOT (r.id = ANY($3::uuid[]))
        ORDER BY coalesce(r.dispatched_through, r.created_at), r.id
        LIMIT $2`,
      [now, limit, exclude],
    );
  }

  /**
   * Gera um lembrete por horario da linha em `(cursor, now]` e avanca o
   * cursor. Paciente inativo consome os horarios sem gerar. Sem horario
   * vencido nada e gravado. Bateu o limite: o cursor para no ultimo gerado.
   */
  dispatch(
    organizationId: string,
    reminderId: string,
    now: Date,
  ): Promise<DispatchOutcome> {
    return this.dataSource.transaction(async (manager) => {
      // Medicamento antes da linha, na ordem da edicao (BE-14): o INSERT do
      // alerta pede KEY SHARE no medicamento e, na ordem inversa, disputaria
      // com uma edicao em curso ate o deadlock.
      const [medication] = await manager.query<unknown[]>(
        `SELECT 1
           FROM medications m
           JOIN medication_reminders r
             ON r.medication_id = m.id
            AND r.organization_id = m.organization_id
          WHERE r.organization_id = $1
            AND r.id = $2
          FOR KEY SHARE OF m SKIP LOCKED`,
        [organizationId, reminderId],
      );

      if (!medication) return { kind: 'skipped' };

      const [reminder] = await manager.query<LockedReminder[]>(
        `SELECT m.id AS "medicationId",
                m.patient_id AS "patientId",
                p.status AS "patientStatus",
                m.name AS "medicationName",
                m.dose_amount::text AS "doseAmount",
                m.dose_unit AS "doseUnit",
                r.start_date::text AS "startDate",
                r.end_date::text AS "endDate",
                r.interval_days AS "intervalDays",
                to_char(r.time_of_day, 'HH24:MI') AS "timeOfDay",
                coalesce(r.dispatched_through, r.created_at) AS cursor
           FROM medication_reminders r
           JOIN medications m
             ON m.id = r.medication_id
            AND m.organization_id = r.organization_id
           JOIN patients p
             ON p.id = m.patient_id
            AND p.organization_id = m.organization_id
          WHERE r.organization_id = $1
            AND r.id = $2
            AND r.deleted_at IS NULL
            AND m.status = 'active'
            AND m.reminders_enabled
          FOR UPDATE OF r SKIP LOCKED`,
        [organizationId, reminderId],
      );

      if (!reminder) return { kind: 'skipped' };

      const occurrences = reminderOccurrences(
        {
          startDate: reminder.startDate,
          endDate: reminder.endDate,
          intervalDays: reminder.intervalDays,
          times: [reminder.timeOfDay],
        },
        reminder.cursor,
        now,
        SWEEP_OCCURRENCE_LIMIT,
      );

      if (occurrences.length === 0) return { kind: 'dispatched', alerts: 0 };

      const alerts =
        reminder.patientStatus === 'active'
          ? await this.insertAlerts(
              manager,
              organizationId,
              reminderId,
              reminder,
              occurrences,
            )
          : 0;
      const cursor =
        occurrences.length === SWEEP_OCCURRENCE_LIMIT
          ? occurrences[occurrences.length - 1]
          : now;

      await manager.query(
        `UPDATE medication_reminders
            SET dispatched_through = $3, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, reminderId, cursor],
      );

      return { kind: 'dispatched', alerts };
    });
  }

  private async insertAlerts(
    manager: EntityManager,
    organizationId: string,
    reminderId: string,
    reminder: LockedReminder,
    occurrences: Date[],
  ): Promise<number> {
    const inserted = await manager.query<
      Array<{ id: string; scheduledAt: Date }>
    >(
      `INSERT INTO alerts
         (organization_id, patient_id, source, medication_id,
          medication_reminder_id, title, message, severity, scheduled_at)
       SELECT $1, $2, 'medication_reminder', $3, $4, $5, x.message, $6,
              x.scheduled_at
         FROM jsonb_to_recordset($7::jsonb) AS x(scheduled_at timestamptz, message text)
       ON CONFLICT (medication_reminder_id, scheduled_at) DO NOTHING
       RETURNING id, scheduled_at AS "scheduledAt"`,
      [
        organizationId,
        reminder.patientId,
        reminder.medicationId,
        reminderId,
        REMINDER_TITLE,
        REMINDER_SEVERITY,
        JSON.stringify(
          occurrences.map((scheduledAt) => ({
            scheduled_at: scheduledAt.toISOString(),
            message: reminderMessage({
              medicationName: reminder.medicationName,
              doseAmount: reminder.doseAmount,
              doseUnit: reminder.doseUnit,
              scheduledAt,
            }),
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
          source: 'medication_reminder',
          medicationId: reminder.medicationId,
          reminderId,
          scheduledAt: alert.scheduledAt.toISOString(),
          severity: REMINDER_SEVERITY,
        },
        requestId: null,
      });
    }

    return inserted.length;
  }
}
