import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';
import { resolveEvolutionPeriod } from '@/modules/Indicator/policies/evolutionPeriod.policy';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';

import type { ManagementReportQueryDto } from '../dtos/managementReport.dto';
import {
  toCaregiverActivity,
  toReportHeader,
} from '../parsers/managementReport.parser';
import { assertManagementReportsAvailable } from '../policies/managementReport.policy';
import { ManagementReportRepository } from '../repositories/managementReport.repository';
import { CAREGIVER_REPORT_EMPTY_MESSAGE } from '../types/managementReport.types';
import type { CaregiverActivityReportDto } from './getCaregiverActivityReport.dto';

const sum = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0);

/**
 * Atividade dos cuidadores (Figura 43, BE-30): medidas objetivas por
 * cuidador, sem nota nem classificacao (decisao de Mateus, 2026-11-12).
 */
@Injectable()
export class GetCaregiverActivityReportUseCase {
  constructor(private readonly reports: ManagementReportRepository) {}

  async execute(
    query: ManagementReportQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<EnvelopePayload<CaregiverActivityReportDto>> {
    const period = resolveEvolutionPeriod(query, today);
    const condition = query.condition ?? null;
    const organizationId = ctx.organizationId;

    await assertManagementReportsAvailable(this.reports, organizationId);

    const [organization, rows, distinct] = await Promise.all([
      this.reports.organization(organizationId),
      this.reports.caregiverActivity(organizationId, period, condition),
      this.reports.caregiverSummary(organizationId, period, condition),
    ]);

    return withMeta(
      {
        ...toReportHeader(period, condition, organization, new Date()),
        summary: {
          caregivers: rows.length,
          linkedPatients: distinct.linkedPatients,
          validFollowUps: sum(rows.map((row) => row.validFollowUps)),
          annulledFollowUps: sum(rows.map((row) => row.annulledFollowUps)),
          absenceAlerts: distinct.absenceAlerts,
          resolvedAlerts: sum(rows.map((row) => row.resolvedAlerts)),
        },
        caregivers: rows.map(toCaregiverActivity),
      },
      rows.length === 0 ? { message: CAREGIVER_REPORT_EMPTY_MESSAGE } : {},
    );
  }
}
