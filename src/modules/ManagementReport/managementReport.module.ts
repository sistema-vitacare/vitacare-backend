import { Module } from '@nestjs/common';

import { GetAlertsReportUseCase } from './GetAlertsReport/getAlertsReport.useCase';
import { GetCaregiverActivityReportUseCase } from './GetCaregiverActivityReport/getCaregiverActivityReport.useCase';
import { ListManagementReportTypesUseCase } from './ListManagementReportTypes/listManagementReportTypes.useCase';
import { ListRecentReportsUseCase } from './ListRecentReports/listRecentReports.useCase';
import { ManagementReportController } from './managementReport.controller';
import { ManagementReportRepository } from './repositories/managementReport.repository';

export const MANAGEMENT_REPORT_USE_CASES = [
  ListManagementReportTypesUseCase,
  ListRecentReportsUseCase,
  GetAlertsReportUseCase,
  GetCaregiverActivityReportUseCase,
];

export const MANAGEMENT_REPORT_SERVICES = [];

export const MANAGEMENT_REPORT_REPOSITORIES = [ManagementReportRepository];

/**
 * Relatorios gerenciais (BE-30). Gerados a cada pedido, sem guardar arquivo;
 * so a exportacao em PDF e auditada (decisoes de Mateus, 2026-11-12).
 */
@Module({
  controllers: [ManagementReportController],
  providers: [
    ...MANAGEMENT_REPORT_USE_CASES,
    ...MANAGEMENT_REPORT_SERVICES,
    ...MANAGEMENT_REPORT_REPOSITORIES,
  ],
})
export class ManagementReportModule {}
