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
import { DASHBOARD_NO_FOLLOW_UPS_MESSAGE } from '../types/dashboard.types';
import type { DashboardFollowUpsDto } from './getDashboardFollowUps.dto';

/** Detalhe de registros (UC05 passo 4): por dia, por formulario e por autor. */
@Injectable()
export class GetDashboardFollowUpsUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(
    query: DashboardPeriodQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<EnvelopePayload<DashboardFollowUpsDto>> {
    const period = resolveEvolutionPeriod(query, today);
    const previous = previousPeriod(period);
    const organizationId = ctx.organizationId;

    await assertDashboardAvailable(this.dashboard, organizationId);

    const [total, previousTotal, byDay, byForm, byAuthor] = await Promise.all([
      this.dashboard.countFollowUps(organizationId, period),
      this.dashboard.countFollowUps(organizationId, previous),
      this.dashboard.followUpsByDay(organizationId, period),
      this.dashboard.followUpsByForm(organizationId, period),
      this.dashboard.followUpsByAuthor(organizationId, period),
    ]);

    return withEmptyNotice(
      {
        period: toPeriodResponse(period),
        previousPeriod: previous,
        inPeriod: total,
        previousPeriodTotal: previousTotal,
        change: total - previousTotal,
        byDay: fillDays(period, byDay),
        byForm: byForm.map(({ id, name, total }) => ({
          form: { id, name },
          total,
        })),
        byAuthor: byAuthor.map(({ id, name, total }) => ({
          user: { id, name },
          total,
        })),
      },
      total === 0,
      DASHBOARD_NO_FOLLOW_UPS_MESSAGE,
    );
  }
}
