import type {
  AlertSeverity,
  AlertSource,
} from '@/modules/Alert/types/alert.types';
import type { EvolutionPeriod } from '@/modules/Indicator/types/evolution.types';

export type DashboardPeriod = EvolutionPeriod;

/** Itens das listas da Figura 33 (decisao de Mateus, 2026-11-09). */
export const DASHBOARD_LIST_SIZE = 5;

export const DASHBOARD_EMPTY_MESSAGE =
  'Nenhum registro de acompanhamento no período selecionado.';

export interface DayCount {
  date: string;
  total: number;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface CountByRef {
  id: string;
  name: string;
  total: number;
}

export interface PriorityAlertRow {
  id: string;
  patientId: string;
  patientName: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  generatedAt: Date;
  fieldName: string | null;
  fieldUnit: string | null;
  value: string | null;
  operator: string | null;
  referenceValue: string | null;
  authorId: string | null;
  authorName: string | null;
}

export interface LatestFollowUpRow {
  id: string;
  patientId: string;
  patientName: string;
  formId: string;
  formName: string;
  authorId: string;
  authorName: string;
  visitedAt: Date;
}

export interface AlertsIssuedBreakdown {
  byDay: DayCount[];
  bySeverity: Record<AlertSeverity, number>;
  bySource: Record<AlertSource, number>;
  stillOpen: number;
}

export interface PendingAlerts {
  total: number;
  bySeverity: Record<AlertSeverity, number>;
}

export interface PatientCounts {
  active: number;
  inactive: number;
  newInPeriod: number;
}

export interface UsersByProfileRow {
  code: string;
  name: string;
  active: number;
  pending: number;
  inactive: number;
}
