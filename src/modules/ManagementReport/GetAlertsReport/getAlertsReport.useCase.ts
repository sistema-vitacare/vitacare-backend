import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';
import { fillDays } from '@/modules/Dashboard/policies/dashboardPeriod.policy';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';

import type { ManagementReportQueryDto } from '../dtos/managementReport.dto';
import {
  toAlertSections,
  toIntercurrence,
  toReportHeader,
  toTopPatient,
} from '../parsers/managementReport.parser';
import {
  assertAlertVolume,
  assertManagementReportsAvailable,
} from '../policies/managementReport.policy';
import { ManagementReportRepository } from '../repositories/managementReport.repository';
import {
  ALERTS_REPORT_EMPTY_MESSAGE,
  INTERCURRENCE_LIST_SIZE,
  TOP_PATIENTS_SIZE,
} from '../types/managementReport.types';
import type { AlertsReportDto } from './getAlertsReport.dto';

/**
 * Alertas e intercorrencias (Figura 43, BE-30): alertas das tres origens
 * emitidos no periodo, com o status atual; intercorrencia = `critical`.
 */
@Injectable()
export class GetAlertsReportUseCase {
  constructor(private readonly reports: ManagementReportRepository) {}

  async execute(
    query: ManagementReportQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<EnvelopePayload<AlertsReportDto>> {
    const period = resolveEvolutionPeriod(query, today);
    const condition = query.condition ?? null;
    const organizationId = ctx.organizationId;

    await assertManagementReportsAvailable(this.reports, organizationId);

    const summary = await this.reports.alertSummary(
      organizationId,
      period,
      condition,
    );

    assertAlertVolume(summary.totals.total);

    const [organization, byDay, topPatients, intercurrences] =
      await Promise.all([
        this.reports.organization(organizationId),
        this.reports.alertsByDay(organizationId, period, condition),
        this.reports.topPatients(
          organizationId,
          period,
          condition,
          TOP_PATIENTS_SIZE,
        ),
        this.reports.intercurrences(
          organizationId,
          period,
          condition,
          INTERCURRENCE_LIST_SIZE,
        ),
      ]);
    const days = new Map(byDay.map((day) => [day.date, day]));

    return withMeta(
      {
        ...toReportHeader(period, condition, organization, new Date()),
        ...toAlertSections(summary),
        topPatients: topPatients.map(toTopPatient),
        byDay: fillDays(period, byDay).map(({ date, total }) => ({
          date,
          total,
          intercurrences: days.get(date)?.intercurrences ?? 0,
        })),
        intercurrences: intercurrences.map(toIntercurrence),
        intercurrencesTruncated:
          summary.totals.intercurrences > INTERCURRENCE_LIST_SIZE,
      },
      summary.totals.total === 0
        ? { message: ALERTS_REPORT_EMPTY_MESSAGE }
        : {},
    );
  }
}
