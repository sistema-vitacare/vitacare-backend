import type { AlertRow } from '@/modules/Alert/types/alert.types';
import type {
  ConflictSource,
  MedicationRow,
} from '@/modules/Medication/types/medication.types';

export const MEASUREMENT_VALUES_PER_FIELD = 5;
export const ACTIVE_MEDICATIONS_LIMIT = 10;
export const RECENT_ALERTS_LIMIT = 5;

/** Uma resposta `number`/`scale` de registro valido, ja ranqueada por campo. */
export interface MeasurementRow {
  fieldKey: string;
  name: string;
  fieldType: 'number' | 'scale';
  unit: string | null;
  section: string | null;
  position: number;
  formId: string;
  formName: string;
  value: string;
  visitedAt: Date;
  followUpId: string;
}

export interface RecordSummary {
  validFollowUps: number;
  lastVisitedAt: Date | null;
  /** Por `fieldKey`, do valor mais recente para o mais antigo. */
  measurements: MeasurementRow[];
}

/** Blocos sem a permissao de leitura correspondente ficam `null`. */
export interface PatientOverview {
  patientId: string;
  records: RecordSummary;
  medications: {
    items: MedicationRow[];
    total: number;
    others: readonly ConflictSource[];
  } | null;
  alerts: { recent: AlertRow[]; open: number } | null;
}
