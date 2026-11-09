import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';

import type { DashboardPeriodQueryDto } from '../dtos/dashboard.dto';
import { toPeriodResponse } from '../parsers/dashboard.parser';
import { assertDashboardAvailable } from '../policies/dashboardAccess.policy';
import { DashboardRepository } from '../repositories/dashboard.repository';
import type { DashboardPatientsDto } from './getDashboardPatients.dto';

/** Detalhe de pacientes (UC05 passo 4): situacao agora, novos no periodo e responsaveis. */
@Injectable()
export class GetDashboardPatientsUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(
    query: DashboardPeriodQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<DashboardPatientsDto> {
    const period = resolveEvolutionPeriod(query, today);

    await assertDashboardAvailable(this.dashboard, ctx.organizationId);

    const [counts, byResponsible] = await Promise.all([
      this.dashboard.patientCounts(ctx.organizationId, period),
      this.dashboard.patientsByResponsible(ctx.organizationId),
    ]);

    return {
      period: toPeriodResponse(period),
      ...counts,
      byResponsible: byResponsible.map(({ id, name, total }) => ({
        professional: { id, name },
        active: total,
      })),
    };
  }
}
