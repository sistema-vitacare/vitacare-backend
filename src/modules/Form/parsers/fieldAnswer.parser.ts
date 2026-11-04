import type { FormFieldRow } from '../types/form.types';

export type AnswerField = Pick<
  FormFieldRow,
  | 'fieldType'
  | 'requirement'
  | 'decimalPlaces'
  | 'scaleMin'
  | 'scaleMax'
  | 'options'
>;

export type FieldAnswerError =
  | 'DISABLED'
  | 'NOT_A_NUMBER'
  | 'TOO_MANY_DECIMALS'
  | 'OUT_OF_SCALE'
  | 'NOT_A_BOOLEAN'
  | 'TOO_LONG'
  | 'NOT_AN_OPTION'
  | 'DUPLICATE_OPTION'
  | 'INVALID_TYPE';

export type FieldAnswer =
  | { kind: 'empty' }
  | { kind: 'value'; text: string }
  | { kind: 'invalid'; code: FieldAnswerError };

export const MAX_TEXT_ANSWER_LENGTH = 2000;

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

const EMPTY: FieldAnswer = { kind: 'empty' };
const value = (text: string): FieldAnswer => ({ kind: 'value', text });
const invalid = (code: FieldAnswerError): FieldAnswer => ({
  kind: 'invalid',
  code,
});

/** `0` e `false` sao valores; vazio e so ausencia, texto em branco ou `[]`. */
const isEmpty = (raw: unknown): boolean =>
  raw === null ||
  raw === undefined ||
  (typeof raw === 'string' && raw.trim() === '') ||
  (Array.isArray(raw) && raw.length === 0);

/**
 * Decimal canonico sem expoente nem zeros finais. Trabalha sobre o texto para
 * nao perder precisao em conversao de ponto flutuante.
 */
const parseNumber = (
  raw: number | string,
  decimalPlaces: number,
): FieldAnswer => {
  if (typeof raw === 'number' && !Number.isFinite(raw)) {
    return invalid('NOT_A_NUMBER');
  }

  const match = DECIMAL.exec(
    typeof raw === 'number' ? String(raw) : raw.trim(),
  );

  if (!match) return invalid('NOT_A_NUMBER');

  const [, sign, integer, fraction = ''] = match;
  const digits = fraction.replace(/0+$/, '');

  if (digits.length > decimalPlaces) return invalid('TOO_MANY_DECIMALS');

  const whole = integer.replace(/^0+(?=\d)/, '');
  const isZero = /^0+$/.test(whole) && digits === '';

  return value(`${isZero ? '' : sign}${whole}${digits ? `.${digits}` : ''}`);
};

/**
 * Contrato de valor de cada tipo de campo (BE-11), aplicado pelo registro de
 * acompanhamento (BE-12) a cada item de resposta. Obrigatoriedade e
 * submissao sem valor nenhum ficam com quem chama.
 */
export const parseFieldAnswer = (
  field: AnswerField,
  raw: unknown,
): FieldAnswer => {
  if (isEmpty(raw)) return EMPTY;
  if (field.requirement === 'disabled') return invalid('DISABLED');

  switch (field.fieldType) {
    case 'number':
      return typeof raw === 'number' || typeof raw === 'string'
        ? parseNumber(raw, field.decimalPlaces ?? 0)
        : invalid('INVALID_TYPE');

    case 'scale':
      if (typeof raw !== 'number') return invalid('INVALID_TYPE');

      return Number.isInteger(raw) &&
        raw >= field.scaleMin! &&
        raw <= field.scaleMax!
        ? value(String(raw))
        : invalid('OUT_OF_SCALE');

    case 'boolean':
      return typeof raw === 'boolean'
        ? value(String(raw))
        : invalid('NOT_A_BOOLEAN');

    case 'text': {
      if (typeof raw !== 'string') return invalid('INVALID_TYPE');

      const text = raw.trim();

      return text.length > MAX_TEXT_ANSWER_LENGTH
        ? invalid('TOO_LONG')
        : value(text);
    }

    case 'single_choice':
      if (typeof raw !== 'string') return invalid('INVALID_TYPE');

      return field.options!.includes(raw)
        ? value(raw)
        : invalid('NOT_AN_OPTION');

    case 'multiple_choice': {
      if (!Array.isArray(raw)) return invalid('INVALID_TYPE');

      const options = field.options!;

      if (
        raw.some((item) => typeof item !== 'string' || !options.includes(item))
      ) {
        return invalid('NOT_AN_OPTION');
      }
      if (new Set(raw).size !== raw.length) return invalid('DUPLICATE_OPTION');

      return value(
        JSON.stringify(options.filter((option) => raw.includes(option))),
      );
    }
  }
};
