import { Injectable, StreamableFile } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import type { PatientReportQueryDto } from '../GetPatientReport/getPatientReport.dto';
import { GetPatientReportUseCase } from '../GetPatientReport/getPatientReport.useCase';
import { PatientReportRepository } from '../repositories/patientReport.repository';
import { PatientReportPdfService } from '../services/patientReportPdf.service';

/**
 * Exportacao em PDF (RF012, UC10 passo 6): gera na hora, sem guardar, e so
 * entrega depois de auditar. Falha na geracao nao audita; a nova tentativa e
 * repetir o pedido, reautorizado (decisoes de Mateus, 2026-11-09).
 */
@Injectable()
export class ExportPatientReportUseCase {
  constructor(
    private readonly getPatientReport: GetPatientReportUseCase,
    private readonly pdf: PatientReportPdfService,
    private readonly reports: PatientReportRepository,
  ) {}

  async execute(
    patientId: string,
    query: PatientReportQueryDto,
    ctx: RequestContext,
  ): Promise<StreamableFile> {
    const report = await this.getPatientReport.execute(patientId, query, ctx);
    const { from, to } = report.period;
    const pdf = await this.pdf.render(report);

    await this.reports.recordExport(ctx, patientId, { from, to });

    // Sem o nome do paciente: o arquivo circula fora do sistema.
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      length: pdf.length,
      disposition: `attachment; filename="relatorio-paciente-${from}-a-${to}.pdf"`,
    });
  }
}
