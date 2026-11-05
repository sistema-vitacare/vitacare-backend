import type { FormFrequency } from '@/modules/Form/types/form.types';
import type { MedicationDoseUnit } from '@/modules/Medication/types/medication.types';

export type AbsenceMonitorStatus = 'active' | 'ended';

/** Severidades fixas decididas por Mateus em 2026-11-05. */
export const ABSENCE_SEVERITY = 'warning';
export const REMINDER_SEVERITY = 'info';

export const ABSENCE_TITLE = 'Ausência de registro';
export const REMINDER_TITLE = 'Lembrete de medicamento';

/** Por execucao da varredura: itens e ocorrencias por item. */
export const SWEEP_ITEM_LIMIT = 200;
export const SWEEP_OCCURRENCE_LIMIT = 50;

export interface AbsenceMessageInput {
  formName: string;
  since: Date;
  frequency: FormFrequency;
}

export interface ReminderMessageInput {
  medicationName: string;
  doseAmount: string;
  doseUnit: MedicationDoseUnit;
  scheduledAt: Date;
}

export interface SweepCount {
  items: number;
  alerts: number;
  failed: number;
}

export type DispatchOutcome =
  { kind: 'skipped' } | { kind: 'dispatched'; alerts: number };

export interface DueItem {
  organizationId: string;
  id: string;
}
