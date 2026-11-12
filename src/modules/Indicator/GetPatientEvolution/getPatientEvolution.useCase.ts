import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, withMeta } from '@/common/http/envelope';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import { groupSeries } from '../policies/evolutionIndicators.policy';
import { resolveEvolutionPeriod } from '../policies/evolutionPeriod.policy';
import { PatientEvolutionRepository } from '../repositories/patientEvolution.repository';
import { EVOLUTION_EMPTY_MESSAGE } from '../types/evolution.types';
import type {
  GetPatientEvolutionQueryDto,
  PatientEvolutionDto,
} from './getPatientEvolution.dto';
import { toPatientEvolutionResponse } from './getPatientEvolution.parser';

/**
 * Evolucao por parametro (RF011, UC10 passos 2-4, UC14 passo 3): series de
 * medicoes validas do periodo, separadas por unidade/faixa, com media,
 * variacao e tendencia. Fora do alcance, nada e lido. Periodo sem medicao
 * leva `meta.message`.
 */
@Injectable()
export class GetPatientEvolutionUseCase {
  constructor(private readonly evolution: PatientEvolutionRepository) {}

  async execute(
    patientId: string,
    query: GetPatientEvolutionQueryDto,
    ctx: RequestContext,
    today: string = todayInBrazil(),
  ): Promise<EnvelopePayload<PatientEvolutionDto>> {
    const period = resolveEvolutionPeriod(query, today);
    const rows = await this.evolution.findPoints(patientScope(ctx), patientId, {
      ...period,
      formId: query.formId,
      fieldKey: query.fieldKey,
    });

    if (!rows) {
      throw new DomainException({
        ...PatientErrors.NOT_FOUND,
        detail:
          'Paciente inexistente, fora da organizacao ou sem vinculo com o usuario.',
      });
    }

    const response = toPatientEvolutionResponse(
      patientId,
      period,
      groupSeries(rows),
    );

    return withMeta(
      response,
      response.series.length === 0 ? { message: EVOLUTION_EMPTY_MESSAGE } : {},
    );
  }
}
