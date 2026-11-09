import type { FollowUpDetail } from '@/modules/FollowUp/types/followUp.types';
import type {
  EvolutionPeriod,
  EvolutionPointRow,
} from '@/modules/Indicator/types/evolution.types';
import type {
  ConflictSource,
  MedicationRow,
} from '@/modules/Medication/types/medication.types';
import type { PatientRow } from '@/modules/Patient/types/patient.types';

/** Acima disso o relatorio pede um periodo menor (`REPORT_TOO_MANY_RECORDS`). */
export const REPORT_MAX_RECORDS = 1000;

/** Teto tecnico da leitura de medicamentos ativos; na pratica, todos. */
export const REPORT_MAX_MEDICATIONS = 1000;

export interface ReportHeaderRow {
  organizationName: string;
  userName: string;
}

/** Tudo o que o relatorio le, ja autorizado pelo alcance da sessao. */
export interface PatientReportSource {
  period: EvolutionPeriod;
  patient: PatientRow;
  /** Registros validos do periodo, da visita mais recente para a mais antiga. */
  records: FollowUpDetail[];
  points: EvolutionPointRow[];
  medications: { items: MedicationRow[]; others: ConflictSource[] };
  header: ReportHeaderRow;
}
