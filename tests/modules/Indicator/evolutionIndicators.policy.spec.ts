import {
  computeIndicators,
  groupSeries,
} from '@/modules/Indicator/policies/evolutionIndicators.policy';
import type { EvolutionPointRow } from '@/modules/Indicator/types/evolution.types';

const DAY_MS = 86_400_000;
const START = Date.parse('2026-05-01T12:00:00.000Z');

const at = (day: number) => new Date(START + day * DAY_MS);

const points = (values: number[], days = values.map((_, index) => index)) =>
  values.map((value, index) => ({ value, visitedAt: at(days[index]) }));

const row = (overrides: Partial<EvolutionPointRow>): EvolutionPointRow => ({
  fieldKey: 'glicemia',
  name: 'Glicemia capilar',
  fieldType: 'number',
  unit: 'mg/dL',
  scaleMin: null,
  scaleMax: null,
  section: 'Sinais vitais',
  position: 0,
  formId: 'form-a',
  formName: 'Sinais vitais',
  value: '100',
  visitedAt: at(0),
  followUpId: 'r1',
  ...overrides,
});

describe('computeIndicators', () => {
  it('fixture conhecida: media simples, ultimo menos primeiro e reta de minimos quadrados por dia', () => {
    expect(
      computeIndicators(points([92, 105, 98, 142], [0, 9, 18, 27])),
    ).toEqual({
      sampleSize: 4,
      min: 92,
      max: 142,
      mean: 109.25,
      variation: 50,
      trend: { slopePerDay: 1.589, direction: 'rising' },
      unavailable: [],
    });
  });

  it('tempo em dias corridos, inclusive fracao de dia', () => {
    const result = computeIndicators(points([10, 12, 14], [0, 0.5, 1]));

    expect(result.trend).toEqual({ slopePerDay: 4, direction: 'rising' });
  });

  it('uma medicao: so a media, e 0 e valor, nao ausencia', () => {
    expect(computeIndicators(points([0]))).toEqual({
      sampleSize: 1,
      min: 0,
      max: 0,
      mean: 0,
      variation: null,
      trend: null,
      unavailable: [
        {
          indicator: 'variation',
          reason: 'INSUFFICIENT_SAMPLES',
          minimumSamples: 2,
        },
        {
          indicator: 'trend',
          reason: 'INSUFFICIENT_SAMPLES',
          minimumSamples: 3,
        },
      ],
    });
  });

  it('duas medicoes: variacao sai, tendencia nao', () => {
    const result = computeIndicators(points([120, 110]));

    expect(result.variation).toBe(-10);
    expect(result.trend).toBeNull();
    expect(result.unavailable).toEqual([
      { indicator: 'trend', reason: 'INSUFFICIENT_SAMPLES', minimumSamples: 3 },
    ]);
  });

  it('tres medicoes no mesmo instante: tendencia sem intervalo de tempo', () => {
    const result = computeIndicators(points([1, 2, 3], [0, 0, 0]));

    expect(result.mean).toBe(2);
    expect(result.variation).toBe(2);
    expect(result.trend).toBeNull();
    expect(result.unavailable).toEqual([
      {
        indicator: 'trend',
        reason: 'INSUFFICIENT_TIME_SPAN',
        minimumSamples: 3,
      },
    ]);
  });

  it('arredonda a 3 casas e da flat quando a inclinacao arredondada e 0', () => {
    const result = computeIndicators(points([1, 0, 0], [0, 10, 20]));

    expect(result.mean).toBe(0.333);
    expect(result.trend).toEqual({ slopePerDay: -0.05, direction: 'falling' });
    expect(
      computeIndicators(points([10.0002, 10, 10], [0, 1, 2])).trend,
    ).toEqual({ slopePerDay: 0, direction: 'flat' });
  });
});

describe('groupSeries', () => {
  it('separa a mesma fieldKey quando a unidade muda e nomeia pela versao mais recente', () => {
    const series = groupSeries([
      row({ followUpId: 'r1', value: '100', visitedAt: at(0) }),
      row({
        followUpId: 'r2',
        value: '5.5',
        unit: 'mmol/L',
        name: 'Glicemia (mmol)',
        visitedAt: at(1),
      }),
      row({
        followUpId: 'r3',
        value: '110',
        name: 'Glicemia',
        visitedAt: at(2),
      }),
    ]);

    expect(series).toHaveLength(2);
    expect(series.map((item) => item.key.unit)).toEqual(['mg/dL', 'mmol/L']);
    expect(series[0].key.name).toBe('Glicemia');
    expect(series[0].points.map((item) => item.followUpId)).toEqual([
      'r1',
      'r3',
    ]);
  });

  it('unidade nula e uma unidade propria', () => {
    expect(
      groupSeries([row({ unit: null }), row({ unit: 'kg', followUpId: 'r2' })]),
    ).toHaveLength(2);
  });

  it('escala separa por faixa minima e maxima', () => {
    const scale = {
      fieldKey: 'dor',
      fieldType: 'scale' as const,
      unit: null,
    };

    expect(
      groupSeries([
        row({ ...scale, scaleMin: 0, scaleMax: 10 }),
        row({ ...scale, scaleMin: 1, scaleMax: 5, followUpId: 'r2' }),
        row({ ...scale, scaleMin: 0, scaleMax: 10, followUpId: 'r3' }),
      ]).map((item) => item.points.length),
    ).toEqual([2, 1]);
  });

  it('mesmo nome em formularios diferentes nao se junta; ordem por formulario e posicao', () => {
    const series = groupSeries([
      row({ formId: 'b', formName: 'Rotina', fieldKey: 'k1' }),
      row({ formId: 'a', formName: 'Diario', fieldKey: 'k2', position: 1 }),
      row({ formId: 'a', formName: 'Diario', fieldKey: 'k3', position: 0 }),
    ]);

    expect(series.map((item) => item.key.fieldKey)).toEqual(['k3', 'k2', 'k1']);
  });

  it('entre series do mesmo campo, a mais recente primeiro', () => {
    const series = groupSeries([
      row({ unit: 'mmol/L', visitedAt: at(0) }),
      row({ unit: 'mg/dL', visitedAt: at(3) }),
      row({ unit: 'mmol/L', visitedAt: at(1) }),
    ]);

    expect(series.map((item) => item.key.unit)).toEqual(['mg/dL', 'mmol/L']);
  });
});
