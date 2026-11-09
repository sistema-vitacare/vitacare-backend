import {
  type EvolutionIndicators,
  type EvolutionPointRow,
  type EvolutionSeries,
  INDICATOR_DECIMALS,
  MINIMUM_SAMPLES,
  type TrendDirection,
  type UnavailableIndicator,
} from '../types/evolution.types';

const DAY_MS = 86_400_000;

interface Sample {
  value: number;
  visitedAt: Date;
}

/** Arredonda sem devolver `-0`. */
const round = (value: number): number =>
  Number(value.toFixed(INDICATOR_DECIMALS)) || 0;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const missing = (
  indicator: UnavailableIndicator['indicator'],
  reason: UnavailableIndicator['reason'] = 'INSUFFICIENT_SAMPLES',
): UnavailableIndicator => ({
  indicator,
  reason,
  minimumSamples: MINIMUM_SAMPLES[indicator],
});

/** Inclinacao de minimos quadrados em unidade por dia corrido; `null` sem intervalo. */
const slopePerDay = (samples: readonly Sample[]): number | null => {
  const origin = samples[0].visitedAt.getTime();
  const days = samples.map(
    (sample) => (sample.visitedAt.getTime() - origin) / DAY_MS,
  );
  const meanDay = sum(days) / days.length;
  const meanValue = sum(samples.map((sample) => sample.value)) / samples.length;
  const spread = sum(days.map((day) => (day - meanDay) ** 2));

  if (spread === 0) return null;

  return (
    sum(
      days.map(
        (day, index) => (day - meanDay) * (samples[index].value - meanValue),
      ),
    ) / spread
  );
};

const directionOf = (slope: number): TrendDirection =>
  slope > 0 ? 'rising' : slope < 0 ? 'falling' : 'flat';

/**
 * Media simples, variacao (ultimo - primeiro) e tendencia (reta de minimos
 * quadrados por dia) das amostras em ordem cronologica, sem classificacao
 * clinica. Indicador sem amostra minima sai `null` e entra em `unavailable`.
 */
export const computeIndicators = (
  samples: readonly Sample[],
): EvolutionIndicators => {
  const values = samples.map((sample) => sample.value);
  const unavailable: UnavailableIndicator[] = [];

  const mean =
    values.length >= MINIMUM_SAMPLES.mean
      ? round(sum(values) / values.length)
      : (unavailable.push(missing('mean')), null);

  const variation =
    values.length >= MINIMUM_SAMPLES.variation
      ? round(values[values.length - 1] - values[0])
      : (unavailable.push(missing('variation')), null);

  let trend: EvolutionIndicators['trend'] = null;

  if (values.length < MINIMUM_SAMPLES.trend) {
    unavailable.push(missing('trend'));
  } else {
    const slope = slopePerDay(samples);

    if (slope === null) {
      unavailable.push(missing('trend', 'INSUFFICIENT_TIME_SPAN'));
    } else {
      const rounded = round(slope);

      trend = { slopePerDay: rounded, direction: directionOf(rounded) };
    }
  }

  return {
    sampleSize: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    mean,
    variation,
    trend,
    unavailable,
  };
};

/** Formulario, campo e configuracao que mudam o significado do valor. */
const compatibilityKey = (row: EvolutionPointRow): string =>
  JSON.stringify([
    row.formId,
    row.fieldKey,
    row.fieldType === 'number' ? [row.unit] : [row.scaleMin, row.scaleMax],
  ]);

/**
 * Linhas em ordem cronologica -> series compativeis. Unidade (`number`) ou
 * faixa (`scale`) diferente entre versoes separa a serie; campos de
 * formularios diferentes nunca se juntam.
 */
export const groupSeries = (rows: EvolutionPointRow[]): EvolutionSeries[] => {
  const groups = new Map<string, EvolutionPointRow[]>();

  for (const row of rows) {
    const key = compatibilityKey(row);

    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()]
    .map((points) => ({ key: points[points.length - 1], points }))
    .sort(
      ({ key: a }, { key: b }) =>
        a.formName.localeCompare(b.formName) ||
        a.formId.localeCompare(b.formId) ||
        a.position - b.position ||
        a.fieldKey.localeCompare(b.fieldKey) ||
        b.visitedAt.getTime() - a.visitedAt.getTime(),
    );
};
