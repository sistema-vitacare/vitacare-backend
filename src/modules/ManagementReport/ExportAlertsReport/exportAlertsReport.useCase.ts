import { Injectable, StreamableFile } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import type { ManagementReportQueryDto } from '../dtos/managementReport.dto';
import { GetAlertsReportUseCase } from '../GetAlertsReport/getAlertsReport.useCase';
import { pdfFile } from '../policies/managementReport.policy';
import { ManagementReportRepository } from '../repositories/managementReport.repository';
import { ManagementReportPdfService } from '../services/managementReportPdf.service';

/**
 * Exporta "Alertas e intercorrencias" em PDF: gera na hora, sem guardar, e so
 * entrega depois de auditar. Falha na geracao nao audita; a nova tentativa e
 * repetir o pedido (decisoes de Mateus, 2026-11-12).
 */
@Injectable()
export class ExportAlertsReportUseCase {
  constructor(
    private readonly getReport: GetAlertsReportUseCase,
    private readonly pdf: ManagementReportPdfService,
    private readonly reports: ManagementReportRepository,
  ) {}

  async execute(
    query: ManagementReportQueryDto,
    ctx: RequestContext,
  ): Promise<StreamableFile> {
    const { data: report } = await this.getReport.execute(query, ctx);
    const period = { from: report.period.from, to: report.period.to };
    const file = await this.pdf.renderAlerts(report);

    await this.reports.recordExport(ctx, 'alerts', period, report.condition);

    return pdfFile(file, 'relatorio-alertas', period);
  }
}
