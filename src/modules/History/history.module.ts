import { Module } from '@nestjs/common';

import { AlertModule } from '@/modules/Alert/alert.module';
import { MedicationModule } from '@/modules/Medication/medication.module';

import { GetPatientOverviewUseCase } from './GetPatientOverview/getPatientOverview.useCase';
import { HistoryController } from './history.controller';
import { PatientOverviewRepository } from './repositories/patientOverview.repository';

export const HISTORY_USE_CASES = [GetPatientOverviewUseCase];

export const HISTORY_REPOSITORIES = [PatientOverviewRepository];

/**
 * Historico e visao consolidada do paciente (BE-18). So leitura: reusa as
 * listagens de medicamentos e alertas para o mesmo alcance e formato.
 */
@Module({
  imports: [AlertModule, MedicationModule],
  controllers: [HistoryController],
  providers: [...HISTORY_USE_CASES, ...HISTORY_REPOSITORIES],
})
export class HistoryModule {}
