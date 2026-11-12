import type {
  AlertSeverity,
  AlertSource,
  AlertStatus,
} from '@/modules/Alert/types/alert.types';
import type { EvolutionPeriod } from '@/modules/Indicator/types/evolution.types';

export type ManagementReportPeriod = EvolutionPeriod;

/** Tipos da Figura 43; o individual e o relatorio do paciente do UC10 (BE-21). */
export const MANAGEMENT_REPORT_TYPES = [
  'patient_follow_up',
  'alerts',
  'caregiver_activity',
] as const;

export type ManagementReportType = (typeof MANAGEMENT_REPORT_TYPES)[number];

/** Tipos gerados por este modulo (os outros sao do BE-21). */
export type GeneratedReportType = Exclude<
  ManagementReportType,
  'patient_follow_up'
>;

/** Decisoes de Mateus em 2026-11-12 (BE-30). */
export const MANAGEMENT_REPORT_MAX_ALERTS = 10_000;
export const INTERCURRENCE_LIST_SIZE = 200;
export const TOP_PATIENTS_SIZE = 10;

export const ALERTS_REPORT_EMPTY_MESSAGE =
  'Nenhum alerta emitido no período selecionado.';

export const CAREGIVER_REPORT_EMPTY_MESSAGE =
  'Nenhuma atividade de cuidador no período selecionado.';

export const RECENT_REPORTS_EMPTY_MESSAGE = 'Nenhum relatório exportado ainda.';

export interface StatusCounts {
  total: number;
  open: number;
  resolved: number;
}

export interface ResolutionRow {
  resolved: number;
  /** Segundos; `null` sem alerta resolvido. */
  averageSeconds: number | null;
  medianSeconds: number | null;
}

export interface AlertSummaryRow {
  totals: StatusCounts & { intercurrences: number };
  bySource: Record<AlertSource, StatusCounts>;
  bySeverity: Record<AlertSeverity, StatusCounts>;
  resolution: ResolutionRow & {
    bySeverity: Record<AlertSeverity, ResolutionRow>;
  };
}

export interface AlertDayRow {
  date: string;
  total: number;
  intercurrences: number;
}

export interface TopPatientRow {
  id: string;
  name: string;
  status: string;
  total: number;
  intercurrences: number;
  open: number;
}

export interface IntercurrenceRow {
  id: string;
  generatedAt: Date;
  source: AlertSource;
  patientId: string;
  patientName: string;
  subject: string | null;
  status: AlertStatus;
  resolvedAt: Date | null;
  secondsToResolve: number | null;
}

export interface CaregiverActivityRow {
  id: string;
  name: string;
  status: string;
  profile: string;
  linkedPatients: number;
  validFollowUps: number;
  annulledFollowUps: number;
  patientsWithFollowUp: number;
  absenceAlerts: number;
  resolvedAlerts: number;
}

export interface CaregiverSummaryRow {
  linkedPatients: number;
  absenceAlerts: number;
}

export interface RecentExportRow {
  id: string;
  type: ManagementReportType;
  patientId: string | null;
  patientName: string | null;
  condition: string | null;
  from: string | null;
  to: string | null;
  actorId: string | null;
  actorName: string | null;
  occurredAt: Date;
}

export interface OrganizationRef {
  id: string;
  name: string;
}
