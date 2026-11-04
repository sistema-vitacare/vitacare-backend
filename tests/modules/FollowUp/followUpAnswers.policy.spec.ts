import { checkAnswers } from '@/modules/FollowUp/policies/followUpAnswers.policy';
import type { VersionField } from '@/modules/FollowUp/types/followUp.types';

const field = (
  id: string,
  overrides: Partial<VersionField> = {},
): VersionField => ({
  id,
  name: `Campo ${id}`,
  fieldType: 'number',
  requirement: 'optional',
  decimalPlaces: 1,
  scaleMin: null,
  scaleMax: null,
  options: null,
  ...overrides,
});

const GLICEMIA = field('glicemia', {
  requirement: 'required',
  decimalPlaces: 0,
});
const DOR = field('dor', {
  fieldType: 'scale',
  decimalPlaces: null,
  scaleMin: 0,
  scaleMax: 10,
});
const BANHO = field('banho', { fieldType: 'boolean', decimalPlaces: null });
const HUMOR = field('humor', {
  fieldType: 'multiple_choice',
  decimalPlaces: null,
  options: ['Calmo', 'Agitado', 'Triste'],
});
const ANTIGO = field('antigo', { requirement: 'disabled' });

const FIELDS = [GLICEMIA, DOR, BANHO, HUMOR, ANTIGO];

describe('checkAnswers', () => {
  it('aceita 0 e false como valores e grava o texto canonico', () => {
    expect(
      checkAnswers(FIELDS, [
        { fieldId: 'glicemia', value: 0 },
        { fieldId: 'dor', value: 0 },
        { fieldId: 'banho', value: false },
        { fieldId: 'humor', value: ['Triste', 'Calmo'] },
      ]),
    ).toEqual({
      kind: 'valid',
      items: [
        { fieldId: 'glicemia', value: '0' },
        { fieldId: 'dor', value: '0' },
        { fieldId: 'banho', value: 'false' },
        { fieldId: 'humor', value: '["Calmo","Triste"]' },
      ],
    });
  });

  it('valor fora de faixa clinica e dado, nao erro', () => {
    expect(
      checkAnswers([GLICEMIA], [{ fieldId: 'glicemia', value: 324 }]),
    ).toEqual({
      kind: 'valid',
      items: [{ fieldId: 'glicemia', value: '324' }],
    });
  });

  it('campo vazio nao gera item', () => {
    expect(
      checkAnswers(FIELDS, [
        { fieldId: 'glicemia', value: '120' },
        { fieldId: 'dor', value: null },
        { fieldId: 'humor', value: [] },
      ]),
    ).toEqual({
      kind: 'valid',
      items: [{ fieldId: 'glicemia', value: '120' }],
    });
  });

  it('sem nenhum valor preenchido e vazio, antes de cobrar obrigatorio', () => {
    expect(checkAnswers(FIELDS, [])).toEqual({ kind: 'empty' });
    expect(
      checkAnswers(FIELDS, [
        { fieldId: 'dor', value: '' },
        { fieldId: 'banho', value: undefined },
      ]),
    ).toEqual({ kind: 'empty' });
  });

  it('obrigatorio ausente aponta o campo pelo id', () => {
    expect(checkAnswers(FIELDS, [{ fieldId: 'dor', value: 3 }])).toEqual({
      kind: 'invalid',
      errors: [
        {
          field: 'answers.glicemia',
          code: 'REQUIRED',
          message: 'Campo glicemia é obrigatório.',
        },
      ],
    });
  });

  it('valor invalido de obrigatorio nao vira REQUIRED tambem', () => {
    expect(
      checkAnswers(FIELDS, [{ fieldId: 'glicemia', value: '12.5' }]),
    ).toEqual({
      kind: 'invalid',
      errors: [{ field: 'answers.0.value', code: 'TOO_MANY_DECIMALS' }],
    });
  });

  it('campo de fora da versao, repetido ou desabilitado e recusado', () => {
    expect(
      checkAnswers(FIELDS, [
        { fieldId: 'glicemia', value: 110 },
        { fieldId: 'outro', value: 1 },
        { fieldId: 'glicemia', value: 111 },
        { fieldId: 'antigo', value: 1 },
        { fieldId: 'dor', value: 11 },
        { fieldId: 'banho', value: 'sim' },
      ]),
    ).toEqual({
      kind: 'invalid',
      errors: [
        { field: 'answers.1.fieldId', code: 'UNKNOWN' },
        { field: 'answers.2.fieldId', code: 'DUPLICATE' },
        { field: 'answers.3.value', code: 'DISABLED' },
        { field: 'answers.4.value', code: 'OUT_OF_SCALE' },
        { field: 'answers.5.value', code: 'NOT_A_BOOLEAN' },
      ],
    });
  });
});
