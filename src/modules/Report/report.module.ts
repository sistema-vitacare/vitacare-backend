import { Module } from '@nestjs/common';

import { FollowUpModule } from '@/modules/FollowUp/followUp.module';
import { IndicatorModule } from '@/modules/Indicator/indicator.module';
import { MedicationModule } from '@/modules/Medication/medication.module';
import { PatientModule } from '@/modules/Patient/patient.module';

import { GetPatientReportUseCase } from './GetPatientReport/getPatientReport.useCase';
import { ReportController } from './report.controller';
import { PatientReportRepository } from './repositories/patientReport.repository';

export const REPORT_USE_CASES = [GetPatientReportUseCase];

export const REPORT_PROVIDERS = [PatientReportRepository];

/**
 * Relatorio do paciente e PDF (BE-21). Gerado a cada pedido, sem guardar
 * arquivo: a autorizacao e refeita sempre (decisao de Mateus, 2026-11-09).
 */
@Module({
  imports: [PatientModule, FollowUpModule, IndicatorModule, MedicationModule],
  controllers: [ReportController],
  providers: [...REPORT_USE_CASES, ...REPORT_PROVIDERS],
})
export class ReportModule {}
