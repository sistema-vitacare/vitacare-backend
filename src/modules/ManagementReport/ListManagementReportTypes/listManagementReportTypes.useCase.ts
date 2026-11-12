import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import { assertManagementReportsAvailable } from '../policies/managementReport.policy';
import { ManagementReportRepository } from '../repositories/managementReport.repository';
import type { ManagementReportType } from '../types/managementReport.types';
import type { ManagementReportTypeDto } from './listManagementReportTypes.dto';

const CATALOG: ReadonlyArray<
  Omit<ManagementReportTypeDto, 'exportCount'> & { type: ManagementReportType }
> = [
  {
    type: 'patient_follow_up',
    name: 'Acompanhamento individual',
    description:
      'Registros, evolução com indicadores e medicamentos de um paciente (UC10).',
    path: '/patients/{patientId}/report',
    pdfPath: '/patients/{patientId}/report/pdf',
    formats: ['pdf'],
  },
  {
    type: 'alerts',
    name: 'Alertas e intercorrências',
    description:
      'Alertas emitidos no período por origem, criticidade e resolução.',
    path: '/management-reports/alerts',
    pdfPath: '/management-reports/alerts/pdf',
    formats: ['pdf'],
  },
  {
    type: 'caregiver_activity',
    name: 'Atividade dos cuidadores',
    description:
      'Vínculos, registros e alertas por cuidador no período, sem classificação de desempenho.',
    path: '/management-reports/caregivers',
    pdfPath: '/management-reports/caregivers/pdf',
    formats: ['pdf'],
  },
];

/** Tipos da Figura 43 com o "N gerados" lido da auditoria. */
@Injectable()
export class ListManagementReportTypesUseCase {
  constructor(private readonly reports: ManagementReportRepository) {}

  async execute(ctx: RequestContext): Promise<ManagementReportTypeDto[]> {
    await assertManagementReportsAvailable(this.reports, ctx.organizationId);

    const counts = await this.reports.exportCounts(ctx.organizationId);

    return CATALOG.map((item) => ({
      ...item,
      formats: [...item.formats],
      exportCount: counts[item.type],
    }));
  }
}
