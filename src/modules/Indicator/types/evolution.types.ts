import type { PatientScope } from '@/modules/Patient/types/patient.types';

/** Amostra minima de cada indicador (decisao de Mateus, 2026-11-09). */
export const MINIMUM_SAMPLES = { mean: 1, variation: 2, trend: 3 } as const;

/** Precisao maxima de um campo `number`. */
export const INDICATOR_DECIMALS = 3;

export const EVOLUTION_DEFAULT_DAYS = 30;
export const EVOLUTION_MAX_DAYS = 366;

/** UC14 alternativo: periodo sem medicao (BE-29, Mateus). */
export const EVOLUTION_EMPTY_MESSAGE =
  'Nenhuma medição no período selecionado.';

export type IndicatorName = keyof typeof MINIMUM_SAMPLES;

export const UNAVAILABLE_REASONS = [
  'INSUFFICIENT_SAMPLES',
  'INSUFFICIENT_TIME_SPAN',
] as const;

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export const TREND_DIRECTIONS = ['rising', 'falling', 'flat'] as const;

export type TrendDirection = (typeof TREND_DIRECTIONS)[number];

/** Uma resposta `number`/`scale` de registro valido, com a versao do campo. */
export interface EvolutionPointRow {
  fieldKey: string;
  name: string;
  fieldType: 'number' | 'scale';
  unit: string | null;
  scaleMin: number | null;
  scaleMax: number | null;
  section: string | null;
  position: number;
  formId: string;
  formName: string;
  value: string;
  visitedAt: Date;
  followUpId: string;
}

/** Pontos em ordem cronologica; `key` e a linha mais recente da serie. */
export interface EvolutionSeries {
  key: EvolutionPointRow;
  points: EvolutionPointRow[];
}

export interface UnavailableIndicator {
  indicator: IndicatorName;
  reason: UnavailableReason;
  minimumSamples: number;
}

export interface EvolutionIndicators {
  sampleSize: number;
  min: number;
  max: number;
  mean: number | null;
  variation: number | null;
  trend: { slopePerDay: number; direction: TrendDirection } | null;
  unavailable: UnavailableIndicator[];
}

export interface EvolutionPeriod {
  from: string;
  to: string;
}

export interface EvolutionFilter extends EvolutionPeriod {
  formId?: string;
  fieldKey?: string;
}

export type EvolutionScope = PatientScope;
