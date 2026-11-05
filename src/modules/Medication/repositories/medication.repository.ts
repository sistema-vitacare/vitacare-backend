import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { findPatientInScope } from '@/modules/PatientAccess/repositories/patientAccess.query';
import { PATIENT_SCOPE_WHERE } from '@/modules/Patient/repositories/patientScope.query';
import type { PatientScope } from '@/modules/Patient/types/patient.types';

import { isSameSchedule } from '../policies/medicationSchedule.policy';
import type {
  ConflictSource,
  CreateMedicationCommand,
  CreateMedicationOutcome,
  DeactivateMedicationOutcome,
  ListMedicationsFilter,
  ListMedicationsOutcome,
  MedicationActor,
  MedicationFields,
  MedicationRow,
  MedicationSchedule,
  MedicationStatus,
  MedicationView,
  ReactivateMedicationOutcome,
  TargetMedicationCommand,
  UpdateMedicationCommand,
  UpdateMedicationOutcome,
} from '../types/medication.types';

/**
 * Agenda de cada medicamento (alias `sched`): as linhas vigentes ou, se o
 * medicamento esta inativo, as encerradas junto com ele (mesmo `deleted_at`).
 */
const SCHEDULE_LATERAL = `
  CROSS JOIN LATERAL (
    SELECT to_char(min(r.start_date), 'YYYY-MM-DD') AS start_date,
           to_char(min(r.end_date), 'YYYY-MM-DD') AS end_date,
           min(r.interval_days)::int AS interval_days,
           array_agg(left(r.time_of_day::text, 5) ORDER BY r.time_of_day) AS times
      FROM medication_reminders r
     WHERE r.organization_id = m.organization_id
       AND r.medication_id = m.id
       AND (r.deleted_at IS NULL
            OR (m.status = 'inactive' AND r.deleted_at = m.deleted_at))
  ) sched`;

const SCHEDULE_COLUMNS = `
         sched.start_date AS "startDate",
         sched.end_date AS "endDate",
         sched.interval_days AS "intervalDays",
         sched.times`;

/** Medicamentos de pacientes do alcance `$1`..`$3` (alias `m`). */
const MEDICATION_FROM = `
    FROM medications m
    JOIN patients p
      ON p.id = m.patient_id
     AND p.organization_id = m.organization_id
  ${PATIENT_SCOPE_WHERE}`;

const MEDICATION_SELECT = `
  SELECT m.id,
         m.patient_id AS "patientId",
         m.name,
         m.dose_amount AS "doseAmount",
         m.dose_unit AS "doseUnit",
         m.route,
         m.notes,
         m.reminders_enabled AS "remindersEnabled",
         m.status,
         ${SCHEDULE_COLUMNS},
         creator.id AS "createdById",
         creator.name AS "createdByName",
         m.created_at AS "createdAt",
         m.updated_at AS "updatedAt",
         m.deleted_at AS "deletedAt"
    FROM medications m
    JOIN patients p
      ON p.id = m.patient_id
     AND p.organization_id = m.organization_id
    JOIN users creator
      ON creator.id = m.created_by_user_id
     AND creator.organization_id = m.organization_id
  ${SCHEDULE_LATERAL}
  ${PATIENT_SCOPE_WHERE}`;

type ScheduleRow = Omit<MedicationSchedule, 'times'> & {
  times: string[] | null;
};

type RawMedicationRow = Omit<MedicationRow, 'doseAmount' | 'schedule'> &
  ScheduleRow & { doseAmount: string };

type RawConflictRow = Omit<ConflictSource, 'schedule'> & ScheduleRow;

const COLUMN_OF: Record<keyof MedicationFields, string> = {
  name: 'name',
  doseAmount: 'dose_amount',
  doseUnit: 'dose_unit',
  route: 'route',
  notes: 'notes',
  remindersEnabled: 'reminders_enabled',
};

const scheduleOf = (row: ScheduleRow): MedicationSchedule => ({
  startDate: row.startDate,
  endDate: row.endDate,
  intervalDays: row.intervalDays,
  times: row.times ?? [],
});

const toRow = (raw: RawMedicationRow): MedicationRow => ({
  id: raw.id,
  patientId: raw.patientId,
  name: raw.name,
  doseAmount: Number(raw.doseAmount),
  doseUnit: raw.doseUnit,
  route: raw.route,
  notes: raw.notes,
  remindersEnabled: raw.remindersEnabled,
  status: raw.status,
  schedule: scheduleOf(raw),
  createdById: raw.createdById,
  createdByName: raw.createdByName,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
  deletedAt: raw.deletedAt,
});

/**
 * Medicamentos e agenda (UC08) da organizacao da sessao. Paciente fora do
 * alcance se comporta como inexistente.
 *
 * Cada linha de `medication_reminders` vale em `[created_at, deleted_at)`.
 * Mudar a agenda (ou ligar/desligar lembretes) encerra as linhas e cria
 * outras; inativar encerra com o mesmo instante gravado no medicamento, e
 * reativar copia essas linhas como novas. Escritas travam o paciente com
 * `FOR SHARE` (conflita com a inativacao dele) e o medicamento com
 * `FOR UPDATE`.
 */
@Injectable()
export class MedicationRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(
    command: CreateMedicationCommand,
  ): Promise<CreateMedicationOutcome> {
    return this.write(async (manager) => {
      const patient = await this.lockPatient(
        manager,
        command,
        command.patientId,
      );

      if (!patient) return { kind: 'patient_not_found' };
      if (patient.status !== 'active') return { kind: 'patient_inactive' };

      const { fields } = command;
      const [{ id }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO medications
           (organization_id, patient_id, created_by_user_id, name, dose_amount,
            dose_unit, route, notes, reminders_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          command.organizationId,
          command.patientId,
          command.actorUserId,
          fields.name,
          fields.doseAmount,
          fields.doseUnit,
          fields.route,
          fields.notes,
          fields.remindersEnabled,
        ],
      );

      await this.insertSchedule(
        manager,
        command.organizationId,
        id,
        command.schedule,
      );
      await this.audit(manager, command, id, 'medication.created', {
        patientId: command.patientId,
        remindersEnabled: fields.remindersEnabled,
        timesCount: command.schedule.times.length,
      });

      return { kind: 'created', ...(await this.viewIn(manager, command, id))! };
    });
  }

  async list(
    scope: PatientScope,
    filter: ListMedicationsFilter,
  ): Promise<ListMedicationsOutcome> {
    try {
      const manager = this.dataSource.manager;

      if (!(await findPatientInScope(manager, scope, filter.patientId))) {
        return { kind: 'patient_not_found' };
      }

      const where = `
          AND m.patient_id = $4
          AND ($5::varchar IS NULL OR m.status = $5)`;
      const parameters = [
        scope.organizationId,
        scope.viewerUserId,
        scope.viewerLinkRoles,
        filter.patientId,
        filter.status ?? null,
      ];

      const [rows, [{ total }], others] = await Promise.all([
        manager.query<RawMedicationRow[]>(
          `${MEDICATION_SELECT} ${where}
            ORDER BY (m.status = 'active') DESC, m.name, m.id
            LIMIT $6 OFFSET $7`,
          [...parameters, filter.take, filter.skip],
        ),
        manager.query<Array<{ total: number }>>(
          `SELECT count(*)::int AS total ${MEDICATION_FROM} ${where}`,
          parameters,
        ),
        this.conflictSources(manager, scope.organizationId, filter.patientId),
      ]);

      return { kind: 'ok', items: rows.map(toRow), total, others };
    } catch (error) {
      throw translatePgError(error, 'medications');
    }
  }

  async findById(
    scope: PatientScope,
    medicationId: string,
  ): Promise<MedicationView | null> {
    try {
      return await this.viewIn(this.dataSource.manager, scope, medicationId);
    } catch (error) {
      throw translatePgError(error, 'medications');
    }
  }

  async update(
    command: UpdateMedicationCommand,
  ): Promise<UpdateMedicationOutcome> {
    return this.write(async (manager) => {
      const target = await this.lockMedication(manager, command);

      if (!target) return { kind: 'not_found' };
      if (target.status !== 'active') return { kind: 'inactive' };

      const patient = await this.lockPatient(
        manager,
        command,
        target.patientId,
      );

      if (patient?.status !== 'active') return { kind: 'patient_inactive' };

      const current = (await this.viewIn(
        manager,
        command,
        command.medicationId,
      ))!.medication;
      const schedule = { ...current.schedule, ...command.schedule };

      if (schedule.endDate !== null && schedule.endDate < schedule.startDate) {
        return { kind: 'invalid_period' };
      }

      const changedFields = (
        Object.keys(command.fields) as Array<keyof MedicationFields>
      ).filter((key) => command.fields[key] !== current[key]);
      const scheduleChanged = !isSameSchedule(schedule, current.schedule);
      const renew =
        scheduleChanged || changedFields.includes('remindersEnabled');

      if (changedFields.length === 0 && !scheduleChanged) {
        return { kind: 'unchanged' };
      }

      await manager.query(
        `UPDATE medications
            SET ${[
              ...changedFields.map(
                (key, index) => `${COLUMN_OF[key]} = $${index + 3}`,
              ),
              'updated_at = now()',
            ].join(', ')}
          WHERE organization_id = $1 AND id = $2`,
        [
          command.organizationId,
          command.medicationId,
          ...changedFields.map((key) => command.fields[key]),
        ],
      );

      if (renew) {
        await this.endSchedule(
          manager,
          command.organizationId,
          command.medicationId,
        );
        await this.insertSchedule(
          manager,
          command.organizationId,
          command.medicationId,
          schedule,
        );
      }

      await this.audit(
        manager,
        command,
        command.medicationId,
        'medication.updated',
        {
          patientId: target.patientId,
          changedFields: [
            ...changedFields,
            ...(
              Object.keys(command.schedule) as Array<keyof MedicationSchedule>
            ).filter((key) =>
              key === 'times'
                ? schedule.times.join() !== current.schedule.times.join()
                : schedule[key] !== current.schedule[key],
            ),
          ],
          scheduleRenewed: renew,
        },
      );

      return {
        kind: 'updated',
        ...(await this.viewIn(manager, command, command.medicationId))!,
      };
    });
  }

  async deactivate(
    command: TargetMedicationCommand,
  ): Promise<DeactivateMedicationOutcome> {
    return this.write(async (manager) => {
      const target = await this.lockMedication(manager, command);

      if (!target) return { kind: 'not_found' };
      if (target.status !== 'active') return { kind: 'already_inactive' };

      await manager.query(
        `UPDATE medications
            SET status = 'inactive', deleted_at = now(), updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [command.organizationId, command.medicationId],
      );
      await this.endSchedule(
        manager,
        command.organizationId,
        command.medicationId,
      );
      await this.audit(
        manager,
        command,
        command.medicationId,
        'medication.deactivated',
        { patientId: target.patientId },
      );

      return {
        kind: 'deactivated',
        ...(await this.viewIn(manager, command, command.medicationId))!,
      };
    });
  }

  async reactivate(
    command: TargetMedicationCommand,
  ): Promise<ReactivateMedicationOutcome> {
    return this.write(async (manager) => {
      const target = await this.lockMedication(manager, command);

      if (!target) return { kind: 'not_found' };
      if (target.status === 'active') return { kind: 'already_active' };

      const patient = await this.lockPatient(
        manager,
        command,
        target.patientId,
      );

      if (patient?.status !== 'active') return { kind: 'patient_inactive' };

      await manager.query(
        `INSERT INTO medication_reminders
           (organization_id, medication_id, start_date, end_date, interval_days, time_of_day)
         SELECT r.organization_id, r.medication_id, r.start_date, r.end_date,
                r.interval_days, r.time_of_day
           FROM medication_reminders r
           JOIN medications m
             ON m.id = r.medication_id
            AND m.organization_id = r.organization_id
          WHERE r.organization_id = $1
            AND r.medication_id = $2
            AND r.deleted_at = m.deleted_at`,
        [command.organizationId, command.medicationId],
      );
      await manager.query(
        `UPDATE medications
            SET status = 'active', deleted_at = NULL, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [command.organizationId, command.medicationId],
      );
      await this.audit(
        manager,
        command,
        command.medicationId,
        'medication.reactivated',
        { patientId: target.patientId },
      );

      return {
        kind: 'reactivated',
        ...(await this.viewIn(manager, command, command.medicationId))!,
      };
    });
  }

  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      throw error instanceof DomainException
        ? error
        : translatePgError(error, 'medications');
    }
  }

  /** Trava o paciente contra a inativacao e confere o alcance. */
  private async lockPatient(
    manager: EntityManager,
    scope: PatientScope,
    patientId: string,
  ) {
    await manager.query(
      `SELECT 1 FROM patients
        WHERE organization_id = $1 AND id = $2
        FOR SHARE`,
      [scope.organizationId, patientId],
    );

    return findPatientInScope(manager, scope, patientId);
  }

  private async lockMedication(
    manager: EntityManager,
    command: TargetMedicationCommand,
  ): Promise<{ patientId: string; status: MedicationStatus } | null> {
    const [row] = await manager.query<
      Array<{ patientId: string; status: MedicationStatus }>
    >(
      `SELECT m.patient_id AS "patientId", m.status
       ${MEDICATION_FROM}
          AND m.id = $4
        FOR UPDATE OF m`,
      [
        command.organizationId,
        command.viewerUserId,
        command.viewerLinkRoles,
        command.medicationId,
      ],
    );

    return row ?? null;
  }

  /** Encerra as linhas vigentes no instante da transacao (`now()`). */
  private async endSchedule(
    manager: EntityManager,
    organizationId: string,
    medicationId: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE medication_reminders
          SET status = 'ended', deleted_at = now(), updated_at = now()
        WHERE organization_id = $1
          AND medication_id = $2
          AND deleted_at IS NULL`,
      [organizationId, medicationId],
    );
  }

  private async insertSchedule(
    manager: EntityManager,
    organizationId: string,
    medicationId: string,
    schedule: MedicationSchedule,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO medication_reminders
         (organization_id, medication_id, start_date, end_date, interval_days, time_of_day)
       SELECT $1, $2, $3::date, $4::date, $5, slot::time
         FROM unnest($6::text[]) AS slot`,
      [
        organizationId,
        medicationId,
        schedule.startDate,
        schedule.endDate,
        schedule.intervalDays,
        schedule.times,
      ],
    );
  }

  private async viewIn(
    manager: EntityManager,
    scope: PatientScope,
    medicationId: string,
  ): Promise<MedicationView | null> {
    const [raw] = await manager.query<RawMedicationRow[]>(
      `${MEDICATION_SELECT} AND m.id = $4`,
      [
        scope.organizationId,
        scope.viewerUserId,
        scope.viewerLinkRoles,
        medicationId,
      ],
    );

    if (!raw) return null;

    return {
      medication: toRow(raw),
      others: await this.conflictSources(
        manager,
        scope.organizationId,
        raw.patientId,
      ),
    };
  }

  /** Medicamentos ativos do paciente com a agenda vigente. */
  private async conflictSources(
    manager: EntityManager,
    organizationId: string,
    patientId: string,
  ): Promise<ConflictSource[]> {
    const rows = await manager.query<RawConflictRow[]>(
      `SELECT m.id, m.name, m.patient_id AS "patientId", ${SCHEDULE_COLUMNS}
         FROM medications m
       ${SCHEDULE_LATERAL}
        WHERE m.organization_id = $1
          AND m.patient_id = $2
          AND m.status = 'active'`,
      [organizationId, patientId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      patientId: row.patientId,
      schedule: scheduleOf(row),
    }));
  }

  private async audit(
    manager: EntityManager,
    actor: MedicationActor,
    medicationId: string,
    action: string,
    afterValues: Record<string, unknown>,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      action,
      entityType: 'medication',
      entityId: medicationId,
      afterValues,
      requestId: actor.requestId,
    });
  }
}
