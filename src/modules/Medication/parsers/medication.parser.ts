import type { RequestContext } from '@/common/context/requestContext.type';

import type { CreateMedicationDto } from '../CreateMedication/createMedication.dto';
import type { MedicationDto } from '../dtos/medication.dto';
import {
  findScheduleConflicts,
  nextOccurrence,
  todayInBrazil,
} from '../policies/medicationSchedule.policy';
import {
  type ConflictSource,
  MEDICATION_TIME_ZONE,
  type MedicationFields,
  type MedicationInput,
  type MedicationPatch,
  type MedicationRow,
  type MedicationSchedule,
} from '../types/medication.types';
import type { UpdateMedicationDto } from '../UpdateMedication/updateMedication.dto';

const FIELD_KEYS = [
  'name',
  'doseAmount',
  'doseUnit',
  'route',
  'notes',
  'remindersEnabled',
] as const satisfies ReadonlyArray<keyof MedicationFields>;

const SCHEDULE_KEYS = [
  'startDate',
  'endDate',
  'intervalDays',
  'times',
] as const satisfies ReadonlyArray<keyof MedicationSchedule>;

/** Corpo de cadastro -> campos e agenda; ausente ou `null` vira o padrao. */
export const toMedicationInput = (
  input: CreateMedicationDto,
  today: string,
): MedicationInput => ({
  fields: {
    name: input.name,
    doseAmount: input.doseAmount,
    doseUnit: input.doseUnit,
    route: input.route ?? null,
    notes: input.notes ?? null,
    remindersEnabled: input.remindersEnabled ?? false,
  },
  schedule: {
    startDate: input.startDate ?? today,
    endDate: input.endDate ?? null,
    intervalDays: input.intervalDays ?? 1,
    times: [...input.times].sort(),
  },
});

/** Corpo de edicao -> so o que veio; horarios em ordem. */
export const toMedicationPatch = (
  input: UpdateMedicationDto,
): MedicationPatch => ({
  fields: Object.fromEntries(
    FIELD_KEYS.filter((key) => input[key] !== undefined).map((key) => [
      key,
      input[key],
    ]),
  ),
  schedule: Object.fromEntries(
    SCHEDULE_KEYS.filter((key) => input[key] !== undefined).map((key) => [
      key,
      key === 'times' ? [...input.times!].sort() : input[key],
    ]),
  ),
});

/**
 * Medicamento -> resposta. `others` sao os ativos do paciente (o proprio e
 * ignorado); inativo nao tem proximo horario nem conflito. O familiar le o
 * medicamento completo (BE-19, decisao de 2026-11-06).
 */
export const toMedicationResponse = (
  row: MedicationRow,
  others: readonly ConflictSource[],
  _ctx: RequestContext,
  now: Date = new Date(),
): MedicationDto => {
  const active = row.status === 'active';
  const next = active ? nextOccurrence(row.schedule, now) : null;

  return {
    id: row.id,
    patientId: row.patientId,
    name: row.name,
    doseAmount: Number(row.doseAmount),
    doseUnit: row.doseUnit,
    route: row.route,
    notes: row.notes,
    schedule: { ...row.schedule, timeZone: MEDICATION_TIME_ZONE },
    remindersEnabled: row.remindersEnabled,
    nextScheduledAt: next?.toISOString() ?? null,
    scheduleConflicts: active
      ? findScheduleConflicts(
          row.schedule,
          others.filter(
            (other) => other.id !== row.id && other.patientId === row.patientId,
          ),
          todayInBrazil(now),
        )
      : [],
    status: row.status,
    createdBy: { id: row.createdById, name: row.createdByName },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deactivatedAt: row.deletedAt?.toISOString() ?? null,
  };
};
