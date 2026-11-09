import type {
  DashboardLatestFollowUpDto,
  DashboardPriorityAlertDto,
} from '../GetDashboard/getDashboard.dto';
import type { DashboardPeriodDto } from '../dtos/dashboard.dto';
import type {
  DashboardPeriod,
  LatestFollowUpRow,
  PriorityAlertRow,
} from '../types/dashboard.types';

export const DASHBOARD_TIME_ZONE = 'America/Sao_Paulo';

export const toPeriodResponse = (
  period: DashboardPeriod,
): DashboardPeriodDto => ({ ...period, timeZone: DASHBOARD_TIME_ZONE });

/** So `reading` tem campo, valor e autor do registro que disparou. */
export const toPriorityAlertResponse = (
  row: PriorityAlertRow,
): DashboardPriorityAlertDto => ({
  id: row.id,
  patient: { id: row.patientId, name: row.patientName },
  source: row.source,
  severity: row.severity,
  title: row.title,
  generatedAt: row.generatedAt.toISOString(),
  reading:
    row.source === 'reading'
      ? {
          fieldName: row.fieldName!,
          fieldUnit: row.fieldUnit,
          value: row.value!,
          operator: row.operator!,
          referenceValue: Number(row.referenceValue),
          author: { id: row.authorId!, name: row.authorName! },
        }
      : null,
});

export const toLatestFollowUpResponse = (
  row: LatestFollowUpRow,
): DashboardLatestFollowUpDto => ({
  id: row.id,
  patient: { id: row.patientId, name: row.patientName },
  form: { id: row.formId, name: row.formName },
  author: { id: row.authorId, name: row.authorName },
  visitedAt: row.visitedAt.toISOString(),
});
