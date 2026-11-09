import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import type { EnvelopePayload } from '@/common/http/envelope';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';

import type { DashboardPeriodQueryDto } from '../dtos/dashboard.dto';
import {
  toLatestFollowUpResponse,
  toPeriodResponse,
  toPriorityAlertResponse,
} from '../parsers/dashboard.parser';
import {
  assertDashboardAvailable,
  withEmptyNotice,
} from '../policies/dashboardAccess.policy';
import { fillDays, previousPeriod } from '../policies/dashboardPeriod.policy';
import { DashboardRepository } from '../repositories/dashboard.repository';
import {
  DASHBOARD_LIST_SIZE,
  DASHBOARD_NO_FOLLOW_UPS_MESSAGE,
} from '../types/dashboard.types';
import type { DashboardDto } from './getDashboard.dto';

/**
 * Painel operacional (UC05 passos 1-3, Figura 33): pacientes e usuarios
 * ativos agora; registros e alertas emitidos no periodo, com o periodo
 * anterior de mesmo tamanho; alertas pendentes; listas curtas.
 */
@Injectable()
export class GetDashboardUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(
    query: DashboardPeriodQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<EnvelopePayload<DashboardDto>> {
    const period = resolveEvolutionPeriod(query, today);
    const previous = previousPeriod(period);
    const organizationId = ctx.organizationId;

    await assertDashboardAvailable(this.dashboard, organizationId);

    const [
      patients,
      profiles,
      followUps,
      previousFollowUps,
      byDay,
      issued,
      previousIssued,
      pending,
      priorityAlerts,
      latestFollowUps,
    ] = await Promise.all([
      this.dashboard.patientCounts(organizationId, period),
      this.dashboard.usersByProfile(organizationId),
      this.dashboard.countFollowUps(organizationId, period),
      this.dashboard.countFollowUps(organizationId, previous),
      this.dashboard.followUpsByDay(organizationId, period),
      this.dashboard.countAlertsIssued(organizationId, period),
      this.dashboard.countAlertsIssued(organizationId, previous),
      this.dashboard.pendingAlerts(organizationId),
      this.dashboard.priorityAlerts(organizationId, DASHBOARD_LIST_SIZE),
      this.dashboard.latestFollowUps(
        organizationId,
        period,
        DASHBOARD_LIST_SIZE,
      ),
    ]);

    return withEmptyNotice(
      {
        period: toPeriodResponse(period),
        previousPeriod: previous,
        patients: {
          active: patients.active,
          newInPeriod: patients.newInPeriod,
        },
        users: {
          active: profiles.reduce((sum, profile) => sum + profile.active, 0),
        },
        followUps: {
          inPeriod: followUps,
          previousPeriodTotal: previousFollowUps,
          change: followUps - previousFollowUps,
          byDay: fillDays(period, byDay),
        },
        alerts: {
          issuedInPeriod: issued,
          previousPeriodTotal: previousIssued,
          change: issued - previousIssued,
          pending: pending.total,
        },
        priorityAlerts: priorityAlerts.map(toPriorityAlertResponse),
        latestFollowUps: latestFollowUps.map(toLatestFollowUpResponse),
      },
      followUps === 0,
      DASHBOARD_NO_FOLLOW_UPS_MESSAGE,
    );
  }
}
