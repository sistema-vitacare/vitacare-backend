import { Module } from '@nestjs/common';

import { DashboardController } from './dashboard.controller';
import { GetDashboardUseCase } from './GetDashboard/getDashboard.useCase';
import { GetDashboardAlertsUseCase } from './GetDashboardAlerts/getDashboardAlerts.useCase';
import { GetDashboardFollowUpsUseCase } from './GetDashboardFollowUps/getDashboardFollowUps.useCase';
import { GetDashboardPatientsUseCase } from './GetDashboardPatients/getDashboardPatients.useCase';
import { GetDashboardUsersUseCase } from './GetDashboardUsers/getDashboardUsers.useCase';
import { DashboardRepository } from './repositories/dashboard.repository';

export const DASHBOARD_USE_CASES = [
  GetDashboardUseCase,
  GetDashboardPatientsUseCase,
  GetDashboardUsersUseCase,
  GetDashboardFollowUpsUseCase,
  GetDashboardAlertsUseCase,
];

export const DASHBOARD_REPOSITORIES = [DashboardRepository];

/** Painel operacional (BE-22). So leitura agregada, sem auditoria nem cache. */
@Module({
  controllers: [DashboardController],
  providers: [...DASHBOARD_USE_CASES, ...DASHBOARD_REPOSITORIES],
})
export class DashboardModule {}
