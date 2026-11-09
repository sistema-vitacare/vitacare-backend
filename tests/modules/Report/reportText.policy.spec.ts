import {
  formatAnswer,
  formatDateTime,
  formatDay,
  formatNumber,
  toPdfText,
} from '@/modules/Report/policies/reportText.policy';

describe('reportText.policy', () => {
  it('troca por ? o que a fonte padrao do PDF nao imprime', () => {
    expect(toPdfText('a🙂中é€')).toBe('a??é€');
    expect(toPdfText('Pressão “alta” — ç ü')).toBe('Pressão “alta” — ç ü');
  });

  it('numeros em pt-BR, ate 3 casas', () => {
    expect(formatNumber(109.25)).toBe('109,25');
    expect(formatNumber(-0.5)).toBe('-0,5');
    expect(formatNumber(2.0564)).toBe('2,056');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234.5)).toBe('1.234,5');
  });

  it('datas no fuso de Sao Paulo', () => {
    expect(formatDay('2026-10-01')).toBe('01/10/2026');
    expect(formatDateTime('2026-10-01T02:59:00.000Z')).toBe('30/09/2026 23:59');
  });

  it('respostas no formato de cada tipo de campo', () => {
    const base = { fieldId: 'f', fieldKey: 'k', name: 'X', section: null };

    expect(
      formatAnswer({
        ...base,
        fieldType: 'number',
        unit: 'mg/dL',
        value: 98.5,
      }),
    ).toBe('98,5 mg/dL');
    expect(
      formatAnswer({ ...base, fieldType: 'scale', unit: null, value: 0 }),
    ).toBe('0');
    expect(
      formatAnswer({ ...base, fieldType: 'boolean', unit: null, value: false }),
    ).toBe('Não');
    expect(
      formatAnswer({
        ...base,
        fieldType: 'multiple_choice',
        unit: null,
        value: ['Tontura', 'Cansaço'],
      }),
    ).toBe('Tontura, Cansaço');
    expect(
      formatAnswer({ ...base, fieldType: 'text', unit: null, value: 'Ok' }),
    ).toBe('Ok');
  });
});
