import type { AlertMatch, AlertRuleOperator } from '../types/alert.types';

const OPERATOR_LABELS: Readonly<Record<AlertRuleOperator, string>> = {
  gt: 'maior que',
  gte: 'maior ou igual a',
  lt: 'menor que',
  lte: 'menor ou igual a',
};

/** `180.500` -> `180.5`; `180.000` -> `180`. */
const trimDecimal = (value: string): string =>
  value.includes('.') ? value.replace(/\.?0+$/, '') : value;

const withUnit = (value: string, unit: string | null): string =>
  unit ? `${value} ${unit}` : value;

/**
 * Mensagem do alerta: so o fato registrado e a regra configurada, sem
 * interpretacao clinica (R04/R10).
 */
export const alertMessage = (match: AlertMatch): string =>
  `${match.fieldName}: ${withUnit(match.value, match.fieldUnit)} (${
    OPERATOR_LABELS[match.operator]
  } ${withUnit(trimDecimal(match.referenceValue), match.fieldUnit)}).`;
