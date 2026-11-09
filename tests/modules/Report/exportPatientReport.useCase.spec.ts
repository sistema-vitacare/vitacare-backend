import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { ExportPatientReportUseCase } from '@/modules/Report/ExportPatientReport/exportPatientReport.useCase';
import type { GetPatientReportUseCase } from '@/modules/Report/GetPatientReport/getPatientReport.useCase';
import { ReportErrors } from '@/modules/Report/report.errors';
import type { PatientReportRepository } from '@/modules/Report/repositories/patientReport.repository';
import type { PatientReportPdfService } from '@/modules/Report/services/patientReportPdf.service';

import {
  captureError,
  PATIENT_ID,
  sessionOf,
} from '../Patient/patient.fixtures';
import { patientReport } from './report.fixtures';

const ctx = sessionOf(ProfileCode.PROFESSIONAL);
const QUERY = { from: '2026-10-01', to: '2026-10-31' };
const PDF = Buffer.from('%PDF-1.3 sintetico');

const setup = (render: jest.Mock, recordExport = jest.fn()) => {
  const getReport = { execute: jest.fn().mockResolvedValue(patientReport()) };
  const useCase = new ExportPatientReportUseCase(
    getReport as unknown as GetPatientReportUseCase,
    { render } as unknown as PatientReportPdfService,
    { recordExport } as unknown as PatientReportRepository,
  );

  return { useCase, getReport, recordExport };
};

describe('ExportPatientReportUseCase', () => {
  it('gera, audita o periodo e devolve o PDF como anexo', async () => {
    const { useCase, getReport, recordExport } = setup(
      jest.fn().mockResolvedValue(PDF),
      jest.fn().mockResolvedValue(undefined),
    );
    const file = await useCase.execute(PATIENT_ID, QUERY, ctx);

    expect(getReport.execute).toHaveBeenCalledWith(PATIENT_ID, QUERY, ctx);
    expect(recordExport).toHaveBeenCalledTimes(1);
    expect(recordExport).toHaveBeenCalledWith(ctx, PATIENT_ID, {
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(file.getHeaders()).toEqual({
      type: 'application/pdf',
      length: PDF.length,
      disposition:
        'attachment; filename="relatorio-paciente-2026-10-01-a-2026-10-31.pdf"',
    });
  });

  it('falha na geracao: erro sobe e nada e auditado', async () => {
    const failure = new DomainException({
      ...ReportErrors.EXPORT_FAILED,
      detail: null,
    });
    const { useCase, recordExport } = setup(
      jest.fn().mockRejectedValue(failure),
    );
    const error = await captureError(useCase.execute(PATIENT_ID, QUERY, ctx));

    expect(error).toBe(failure);
    expect(recordExport).not.toHaveBeenCalled();
  });

  it('falha ao auditar: o PDF nao sai', async () => {
    const { useCase } = setup(
      jest.fn().mockResolvedValue(PDF),
      jest.fn().mockRejectedValue(new Error('banco fora')),
    );

    await expect(useCase.execute(PATIENT_ID, QUERY, ctx)).rejects.toThrow(
      'banco fora',
    );
  });
});
