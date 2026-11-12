import type { ManagementReportHeaderDto } from '../dtos/managementReport.dto';
import type {
  AlertResolutionDto,
  AlertsReportDto,
  AlertStatusCountsDto,
  IntercurrenceDto,
  ResolutionTimeDto,
  TopAlertPatientDto,
} from '../GetAlertsReport/getAlertsReport.dto';
import type { CaregiverActivityDto } from '../GetCaregiverActivityReport/getCaregiverActivityReport.dto';
import type { RecentReportDto } from '../ListRecentReports/listRecentReports.dto';
import { toHours } from '../policies/managementReport.policy';
import type {
  AlertSummaryRow,
  CaregiverActivityRow,
  IntercurrenceRow,
  ManagementReportPeriod,
  OrganizationRef,
  RecentExportRow,
  ResolutionRow,
  StatusCounts,
  TopPatientRow,
} from '../types/managementReport.types';

export const MANAGEMENT_REPORT_TIME_ZONE = 'America/Sao_Paulo';

export const toReportHeader = (
  period: ManagementReportPeriod,
  condition: string | null,
  organization: OrganizationRef,
  generatedAt: Date,
): ManagementReportHeaderDto => ({
  period: { ...period, timeZone: MANAGEMENT_REPORT_TIME_ZONE },
  condition,
  generatedAt: generatedAt.toISOString(),
  organization: { id: organization.id, name: organization.name },
});

const toCounts = (counts: StatusCounts): AlertStatusCountsDto => ({
  total: counts.total,
  open: counts.open,
  resolved: counts.resolved,
});

const toResolutionTime = (row: ResolutionRow): ResolutionTimeDto => ({
  resolved: row.resolved,
  averageHours: toHours(row.averageSeconds),
  medianHours: toHours(row.medianSeconds),
});

export const toAlertSections = (
  summary: AlertSummaryRow,
): Pick<
  AlertsReportDto,
  'totals' | 'bySource' | 'bySeverity' | 'resolution'
> => {
  const resolution: AlertResolutionDto = {
    overall: toResolutionTime(summary.resolution),
    bySeverity: {
      critical: toResolutionTime(summary.resolution.bySeverity.critical),
      warning: toResolutionTime(summary.resolution.bySeverity.warning),
      info: toResolutionTime(summary.resolution.bySeverity.info),
    },
  };

  return {
    totals: {
      issued: summary.totals.total,
      open: summary.totals.open,
      resolved: summary.totals.resolved,
      intercurrences: summary.totals.intercurrences,
    },
    bySource: {
      reading: toCounts(summary.bySource.reading),
      absence: toCounts(summary.bySource.absence),
      medicationReminder: toCounts(summary.bySource.medication_reminder),
    },
    bySeverity: {
      critical: toCounts(summary.bySeverity.critical),
      warning: toCounts(summary.bySeverity.warning),
      info: toCounts(summary.bySeverity.info),
    },
    resolution,
  };
};

export const toTopPatient = (row: TopPatientRow): TopAlertPatientDto => ({
  patient: { id: row.id, name: row.name, status: row.status },
  total: row.total,
  intercurrences: row.intercurrences,
  open: row.open,
});

export const toIntercurrence = (row: IntercurrenceRow): IntercurrenceDto => ({
  id: row.id,
  generatedAt: new Date(row.generatedAt).toISOString(),
  source: row.source,
  patient: { id: row.patientId, name: row.patientName },
  subject: row.subject,
  status: row.status,
  resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null,
  hoursToResolve: toHours(row.secondsToResolve),
});

export const toCaregiverActivity = (
  row: CaregiverActivityRow,
): CaregiverActivityDto => ({
  caregiver: {
    id: row.id,
    name: row.name,
    status: row.status,
    profile: row.profile,
  },
  linkedPatients: row.linkedPatients,
  validFollowUps: row.validFollowUps,
  annulledFollowUps: row.annulledFollowUps,
  patientsWithFollowUp: row.patientsWithFollowUp,
  patientsWithoutFollowUp: row.linkedPatients - row.patientsWithFollowUp,
  absenceAlerts: row.absenceAlerts,
  resolvedAlerts: row.resolvedAlerts,
});

export const toRecentReport = (row: RecentExportRow): RecentReportDto => ({
  id: row.id,
  type: row.type,
  scope:
    row.type === 'patient_follow_up'
      ? {
          kind: 'patient',
          patient: row.patientId
            ? { id: row.patientId, name: row.patientName ?? '' }
            : null,
          condition: null,
        }
      : {
          kind: row.condition ? 'condition' : 'all',
          patient: null,
          condition: row.condition,
        },
  period: { from: row.from, to: row.to },
  format: 'pdf',
  generatedBy: row.actorId
    ? { id: row.actorId, name: row.actorName ?? '' }
    : null,
  generatedAt: new Date(row.occurredAt).toISOString(),
});
