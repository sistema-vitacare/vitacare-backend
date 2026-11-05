import type { PatientScope } from '@/modules/Patient/types/patient.types';

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

/** Dados do medicamento gravados em `medications` (sem agenda nem status). */
export interface MedicationFields {
  name: string;
  doseAmount: number;
  doseUnit: MedicationDoseUnit;
  route: MedicationRoute | null;
  notes: string | null;
  remindersEnabled: boolean;
}

/** Medicamento com a agenda vigente (ou a encerrada junto, se inativo). */
export interface MedicationRow extends MedicationFields {
  id: string;
  patientId: string;
  status: MedicationStatus;
  schedule: MedicationSchedule;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Outro medicamento ativo do paciente, base do aviso de sobreposicao. */
export interface ConflictSource {
  id: string;
  name: string;
  patientId: string;
  schedule: MedicationSchedule;
}

export interface MedicationView {
  medication: MedicationRow;
  others: ConflictSource[];
}

export interface MedicationInput {
  fields: MedicationFields;
  schedule: MedicationSchedule;
}

/** So o que veio no `PATCH`; `undefined` = nao mexe. */
export interface MedicationPatch {
  fields: Partial<MedicationFields>;
  schedule: Partial<MedicationSchedule>;
}

/** Organizacao, ator e requestId vem sempre da sessao, nunca do corpo. */
export interface MedicationActor extends PatientScope {
  actorUserId: string;
  requestId: string;
}

export interface CreateMedicationCommand
  extends MedicationActor, MedicationInput {
  patientId: string;
}

export interface UpdateMedicationCommand
  extends MedicationActor, MedicationPatch {
  medicationId: string;
}

export interface TargetMedicationCommand extends MedicationActor {
  medicationId: string;
}

export interface ListMedicationsFilter {
  patientId: string;
  status?: MedicationStatus;
  skip: number;
  take: number;
}

export type CreateMedicationOutcome =
  | ({ kind: 'created' } & MedicationView)
  | { kind: 'patient_not_found' | 'patient_inactive' };

export type ListMedicationsOutcome =
  | {
      kind: 'ok';
      items: MedicationRow[];
      total: number;
      others: ConflictSource[];
    }
  | { kind: 'patient_not_found' };

export type UpdateMedicationOutcome =
  | ({ kind: 'updated' } & MedicationView)
  | {
      kind:
        | 'not_found'
        | 'inactive'
        | 'patient_inactive'
        | 'invalid_period'
        | 'unchanged';
    };

export type DeactivateMedicationOutcome =
  | ({ kind: 'deactivated' } & MedicationView)
  | { kind: 'not_found' | 'already_inactive' };

export type ReactivateMedicationOutcome =
  | ({ kind: 'reactivated' } & MedicationView)
  | { kind: 'not_found' | 'already_active' | 'patient_inactive' };
