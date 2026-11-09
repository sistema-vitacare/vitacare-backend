import { Module } from '@nestjs/common';

import { GetPatientEvolutionUseCase } from './GetPatientEvolution/getPatientEvolution.useCase';
import { IndicatorController } from './indicator.controller';
import { PatientEvolutionRepository } from './repositories/patientEvolution.repository';

export const INDICATOR_USE_CASES = [GetPatientEvolutionUseCase];

export const INDICATOR_REPOSITORIES = [PatientEvolutionRepository];

/**
 * Series de evolucao e indicadores clinicos (BE-20). So leitura; o relatorio
 * do BE-21 reusa os mesmos calculos.
 */
@Module({
  controllers: [IndicatorController],
  providers: [...INDICATOR_USE_CASES, ...INDICATOR_REPOSITORIES],
})
export class IndicatorModule {}
