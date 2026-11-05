/** Unidades de dose (decisao de Mateus em 2026-11-05; MER: `dosagem_mg INT`). */
export const MEDICATION_DOSE_UNITS = [
  'mg',
  'mcg',
  'g',
  'ml',
  'iu',
  'drops',
  'tablet',
  'capsule',
  'application',
] as const;

export type MedicationDoseUnit = (typeof MEDICATION_DOSE_UNITS)[number];

/** Vias de administracao (DER `viaAdministracao`; ausente no MER). */
export const MEDICATION_ROUTES = [
  'oral',
  'sublingual',
  'topical',
  'transdermal',
  'inhalation',
  'nasal',
  'ophthalmic',
  'otic',
  'rectal',
  'vaginal',
  'subcutaneous',
  'intramuscular',
  'intravenous',
  'other',
] as const;

export type MedicationRoute = (typeof MEDICATION_ROUTES)[number];

export const MEDICATION_STATUSES = ['active', 'inactive'] as const;

export type MedicationStatus = (typeof MEDICATION_STATUSES)[number];

/** Fuso unico dos horarios e datas da agenda (decisao de 2026-11-05). */
export const MEDICATION_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Agenda de um medicamento: `times` (`HH:mm`, hora local de Brasilia) se
 * repetem a cada `intervalDays` dias a partir de `startDate`, ate `endDate`
 * (`null` = uso continuo). Datas em `YYYY-MM-DD`.
 */
export interface MedicationSchedule {
  startDate: string;
  endDate: string | null;
  intervalDays: number;
  times: string[];
}

/** Aviso de sobreposicao do UC08: outro medicamento ativo no mesmo horario. */
export interface ScheduleConflict {
  medicationId: string;
  medicationName: string;
  time: string;
}

export type MedicationReminderStatus = 'active' | 'ended';
