import { DomainException } from '@/common/errors/domain.exception';

import { ManagementReportErrors } from '../managementReport.errors';
import { MANAGEMENT_REPORT_MAX_ALERTS } from '../types/managementReport.types';

/** Segundos -> horas com 3 casas, como os indicadores do BE-20. */
export const toHours = (seconds: number | null): number | null =>
  seconds === null ? null : Math.round((seconds / 3600) * 1000) / 1000;

/** Recurso `management_reports` do plano (Quadro 2), antes de qualquer consulta. */
export const assertManagementReportsAvailable = async (
  reports: { hasManagementReports(organizationId: string): Promise<boolean> },
  organizationId: string,
): Promise<void> => {
  if (await reports.hasManagementReports(organizationId)) return;

  throw new DomainException({
    ...ManagementReportErrors.PLAN_FEATURE_UNAVAILABLE,
    detail: 'O plano corrente da organizacao nao inclui management_reports.',
  });
};

/** Teto de volume do relatorio de alertas (decisao de Mateus, 2026-11-12). */
export const assertAlertVolume = (total: number): void => {
  if (total <= MANAGEMENT_REPORT_MAX_ALERTS) return;

  throw new DomainException({
    ...ManagementReportErrors.TOO_MANY_ALERTS,
    detail: `${total} alertas no periodo; o limite e ${MANAGEMENT_REPORT_MAX_ALERTS}.`,
  });
};
