import { toAnswerValue } from '@/modules/FollowUp/parsers/followUp.parser';

import { computeIndicators } from '../policies/evolutionIndicators.policy';
import type {
  EvolutionPeriod,
  EvolutionSeries,
} from '../types/evolution.types';
import type {
  EvolutionSeriesDto,
  PatientEvolutionDto,
} from './getPatientEvolution.dto';

const EVOLUTION_TIME_ZONE = 'America/Sao_Paulo';

const toSeries = ({ key, points }: EvolutionSeries): EvolutionSeriesDto => {
  const values = points.map((row) => ({
    value: toAnswerValue(row.fieldType, row.value) as number,
    visitedAt: row.visitedAt,
    followUpId: row.followUpId,
  }));

  return {
    fieldKey: key.fieldKey,
    name: key.name,
    fieldType: key.fieldType,
    unit: key.unit,
    scaleMin: key.scaleMin,
    scaleMax: key.scaleMax,
    section: key.section,
    form: { id: key.formId, name: key.formName },
    points: values.map((point) => ({
      ...point,
      visitedAt: point.visitedAt.toISOString(),
    })),
    indicators: computeIndicators(values),
  };
};

/** Igual para todos os perfis com a permissao (decisao de Mateus, 2026-11-09). */
export const toPatientEvolutionResponse = (
  patientId: string,
  period: EvolutionPeriod,
  series: EvolutionSeries[],
): PatientEvolutionDto => ({
  patientId,
  period: { ...period, timeZone: EVOLUTION_TIME_ZONE },
  series: series.map(toSeries),
});
