import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import type { EnvelopePayload } from '@/common/http/envelope';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';

import type { DashboardPeriodQueryDto } from '../dtos/dashboard.dto';
import { toPeriodResponse } from '../parsers/dashboard.parser';
import {
  assertDashboardAvailable,
  withEmptyNotice,
} from '../policies/dashboardAccess.policy';
import { fillDays, previousPeriod } from '../policies/dashboardPeriod.policy';
import { DashboardRepository } from '../repositories/dashboard.repository';
import { DASHBOARD_NO_ALERTS_MESSAGE } from '../types/dashboard.types';
import type { DashboardAlertsDto } from './getDashboardAlerts.dto';

/** Detalhe de alertas (UC05 passo 4): emitidos no periodo e pendentes agora. */
@Injectable()
export class GetDashboardAlertsUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(
    query: DashboardPeriodQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<EnvelopePayload<DashboardAlertsDto>> {
    const period = resolveEvolutionPeriod(query, today);
    const previous = previousPeriod(period);
    const organizationId = ctx.organizationId;

    await assertDashboardAvailable(this.dashboard, organizationId);

    const [issued, previousIssued, breakdown, pending] = await Promise.all([
      this.dashboard.countAlertsIssued(organizationId, period),
      this.dashboard.countAlertsIssued(organizationId, previous),
      this.dashboard.alertsIssuedBreakdown(organizationId, period),
      this.dashboard.pendingAlerts(organizationId),
    ]);

    return withEmptyNotice(
      {
        period: toPeriodResponse(period),
        previousPeriod: previous,
        issuedInPeriod: issued,
        previousPeriodTotal: previousIssued,
        change: issued - previousIssued,
        byDay: fillDays(period, breakdown.byDay),
        bySeverity: breakdown.bySeverity,
        bySource: breakdown.bySource,
        issuedStillOpen: breakdown.stillOpen,
        pending,
      },
      issued === 0,
      DASHBOARD_NO_ALERTS_MESSAGE,
    );
  }
}
