import {
  parseFieldAnswer,
  type AnswerField,
} from '@/modules/Form/parsers/fieldAnswer.parser';

const number = (decimalPlaces = 1): AnswerField => ({
  fieldType: 'number',
  requirement: 'optional',
  decimalPlaces,
  scaleMin: null,
  scaleMax: null,
  options: null,
});

const scale: AnswerField = {
  fieldType: 'scale',
  requirement: 'required',
  decimalPlaces: null,
  scaleMin: 0,
  scaleMax: 10,
  options: null,
};

const ofType = (
  fieldType: AnswerField['fieldType'],
  options: string[] | null = null,
): AnswerField => ({
  fieldType,
  requirement: 'optional',
  decimalPlaces: null,
  scaleMin: null,
  scaleMax: null,
  options,
});

const value = (text: string) => ({ kind: 'value', text });
const invalid = (code: string) => ({ kind: 'invalid', code });
const EMPTY = { kind: 'empty' };

describe('parseFieldAnswer', () => {
  it.each([null, undefined, '', '   '])(
    'trata %p como vazio em qualquer tipo',
    (raw) => {
      for (const field of [
        number(),
        scale,
        ofType('boolean'),
        ofType('text'),
        ofType('single_choice', ['A', 'B']),
        ofType('multiple_choice', ['A', 'B']),
      ]) {
        expect(parseFieldAnswer(field, raw)).toEqual(EMPTY);
      }
    },
  );

  it('number: zero e valor, normaliza zeros finais e respeita casas', () => {
    expect(parseFieldAnswer(number(0), 0)).toEqual(value('0'));
    expect(parseFieldAnswer(number(1), '36.50')).toEqual(value('36.5'));
    expect(parseFieldAnswer(number(1), 36.5)).toEqual(value('36.5'));
    expect(parseFieldAnswer(number(1), '-2')).toEqual(value('-2'));
    expect(parseFieldAnswer(number(1), 36.55)).toEqual(
      invalid('TOO_MANY_DECIMALS'),
    );
    expect(parseFieldAnswer(number(), '1e3')).toEqual(invalid('NOT_A_NUMBER'));
    expect(parseFieldAnswer(number(), Infinity)).toEqual(
      invalid('NOT_A_NUMBER'),
    );
    expect(parseFieldAnswer(number(), {})).toEqual(invalid('INVALID_TYPE'));
  });

  it('scale: inteiro dentro da faixa, zero incluso', () => {
    expect(parseFieldAnswer(scale, 0)).toEqual(value('0'));
    expect(parseFieldAnswer(scale, 10)).toEqual(value('10'));
    expect(parseFieldAnswer(scale, 11)).toEqual(invalid('OUT_OF_SCALE'));
    expect(parseFieldAnswer(scale, 2.5)).toEqual(invalid('OUT_OF_SCALE'));
    expect(parseFieldAnswer(scale, 'sete')).toEqual(invalid('INVALID_TYPE'));
  });

  it('boolean: false e valor; string nao', () => {
    expect(parseFieldAnswer(ofType('boolean'), false)).toEqual(value('false'));
    expect(parseFieldAnswer(ofType('boolean'), true)).toEqual(value('true'));
    expect(parseFieldAnswer(ofType('boolean'), 'false')).toEqual(
      invalid('NOT_A_BOOLEAN'),
    );
  });

  it('text: aparado e limitado a 2000 caracteres', () => {
    expect(parseFieldAnswer(ofType('text'), '  ok ')).toEqual(value('ok'));
    expect(parseFieldAnswer(ofType('text'), 'a'.repeat(2000))).toEqual(
      value('a'.repeat(2000)),
    );
    expect(parseFieldAnswer(ofType('text'), 'a'.repeat(2001))).toEqual(
      invalid('TOO_LONG'),
    );
    expect(parseFieldAnswer(ofType('text'), 12)).toEqual(
      invalid('INVALID_TYPE'),
    );
  });

  it('single_choice: so uma das opcoes', () => {
    const field = ofType('single_choice', ['Boa', 'Ruim']);

    expect(parseFieldAnswer(field, 'Boa')).toEqual(value('Boa'));
    expect(parseFieldAnswer(field, 'Otima')).toEqual(invalid('NOT_AN_OPTION'));
  });

  it('multiple_choice: opcoes distintas, gravadas na ordem das opcoes', () => {
    const field = ofType('multiple_choice', ['A', 'B', 'C']);

    expect(parseFieldAnswer(field, [])).toEqual(EMPTY);
    expect(parseFieldAnswer(field, ['C', 'A'])).toEqual(value('["A","C"]'));
    expect(parseFieldAnswer(field, ['A', 'A'])).toEqual(
      invalid('DUPLICATE_OPTION'),
    );
    expect(parseFieldAnswer(field, ['D'])).toEqual(invalid('NOT_AN_OPTION'));
    expect(parseFieldAnswer(field, 'A')).toEqual(invalid('INVALID_TYPE'));
  });

  it('campo desabilitado nao aceita valor, nem zero ou falso', () => {
    expect(
      parseFieldAnswer({ ...number(), requirement: 'disabled' }, 0),
    ).toEqual(invalid('DISABLED'));
    expect(
      parseFieldAnswer(
        { ...ofType('boolean'), requirement: 'disabled' },
        false,
      ),
    ).toEqual(invalid('DISABLED'));
    expect(
      parseFieldAnswer({ ...number(), requirement: 'disabled' }, null),
    ).toEqual(EMPTY);
  });
});
