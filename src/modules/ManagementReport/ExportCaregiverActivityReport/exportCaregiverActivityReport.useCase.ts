import { Injectable, StreamableFile } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import type { ManagementReportQueryDto } from '../dtos/managementReport.dto';
import { GetCaregiverActivityReportUseCase } from '../GetCaregiverActivityReport/getCaregiverActivityReport.useCase';
import { pdfFile } from '../policies/managementReport.policy';
import { ManagementReportRepository } from '../repositories/managementReport.repository';
import { ManagementReportPdfService } from '../services/managementReportPdf.service';

/** Exporta "Atividade dos cuidadores" em PDF, na mesma regra dos alertas. */
@Injectable()
export class ExportCaregiverActivityReportUseCase {
  constructor(
    private readonly getReport: GetCaregiverActivityReportUseCase,
    private readonly pdf: ManagementReportPdfService,
    private readonly reports: ManagementReportRepository,
  ) {}

  async execute(
    query: ManagementReportQueryDto,
    ctx: RequestContext,
  ): Promise<StreamableFile> {
    const { data: report } = await this.getReport.execute(query, ctx);
    const period = { from: report.period.from, to: report.period.to };
    const file = await this.pdf.renderCaregivers(report);

    await this.reports.recordExport(
      ctx,
      'caregiver_activity',
      period,
      report.condition,
    );

    return pdfFile(file, 'relatorio-atividade-cuidadores', period);
  }
}
