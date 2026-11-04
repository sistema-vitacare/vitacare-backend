import {
  checkFieldKeys,
  checkFormFields,
} from '@/modules/Form/policies/formFields.policy';
import type {
  FieldType,
  FormFieldConfig,
} from '@/modules/Form/types/form.types';

const KEY_A = '7a5b3c1d-0000-4000-8000-00000000000a';
const KEY_B = '7a5b3c1d-0000-4000-8000-00000000000b';

const field = (overrides: Partial<FormFieldConfig> = {}): FormFieldConfig => ({
  name: 'Glicemia',
  fieldType: 'number',
  requirement: 'optional',
  section: null,
  unit: 'mg/dL',
  decimalPlaces: 0,
  scaleMin: null,
  scaleMax: null,
  options: null,
  ...overrides,
});

const scale = (overrides: Partial<FormFieldConfig> = {}) =>
  field({
    name: 'Humor',
    fieldType: 'scale',
    unit: null,
    decimalPlaces: null,
    scaleMin: 0,
    scaleMax: 10,
    ...overrides,
  });

const choice = (overrides: Partial<FormFieldConfig> = {}) =>
  field({
    name: 'Alimentacao',
    fieldType: 'single_choice',
    unit: null,
    decimalPlaces: null,
    options: ['Boa', 'Ruim'],
    ...overrides,
  });

describe('checkFormFields', () => {
  it('aceita zero em decimalPlaces e scaleMin e tipos sem extras', () => {
    expect(
      checkFormFields([
        field({ decimalPlaces: 0 }),
        scale({ scaleMin: 0 }),
        field({
          name: 'Banho assistido',
          fieldType: 'boolean',
          unit: null,
          decimalPlaces: null,
        }),
        field({
          name: 'Observacoes',
          fieldType: 'text',
          unit: null,
          decimalPlaces: null,
        }),
        choice({ fieldType: 'multiple_choice' }),
      ]),
    ).toEqual([]);
  });

  it('exige a configuracao propria de cada tipo', () => {
    expect(checkFormFields([field({ decimalPlaces: null })])).toEqual([
      { field: 'fields[0].decimalPlaces', code: 'REQUIRED' },
    ]);
    expect(checkFormFields([scale({ scaleMax: null })])).toEqual([
      { field: 'fields[0].scaleMax', code: 'REQUIRED' },
    ]);
    expect(checkFormFields([choice({ options: null })])).toEqual([
      { field: 'fields[0].options', code: 'REQUIRED' },
    ]);
  });

  it('recusa configuracao alheia ao tipo', () => {
    expect(checkFormFields([scale({ unit: 'pts' })])).toEqual([
      { field: 'fields[0].unit', code: 'NOT_ALLOWED' },
    ]);
    expect(
      checkFormFields([
        field({
          fieldType: 'text',
          unit: null,
          decimalPlaces: null,
          options: ['A', 'B'],
        }),
      ]),
    ).toEqual([{ field: 'fields[0].options', code: 'NOT_ALLOWED' }]);
  });

  it('recusa escala com minimo maior ou igual ao maximo', () => {
    expect(checkFormFields([scale({ scaleMin: 5, scaleMax: 5 })])).toEqual([
      { field: 'fields[0].scaleMax', code: 'INVALID_RANGE' },
    ]);
  });

  it('aponta nome repetido ignorando caixa e espacos, chave e opcao repetidas', () => {
    expect(checkFormFields([field(), field({ name: ' GLICEMIA ' })])).toEqual([
      { field: 'fields[1].name', code: 'DUPLICATE' },
    ]);
    expect(
      checkFormFields([field({ fieldKey: KEY_A }), scale({ fieldKey: KEY_A })]),
    ).toEqual([{ field: 'fields[1].fieldKey', code: 'DUPLICATE' }]);
    expect(checkFormFields([choice({ options: ['Boa', 'boa '] })])).toEqual([
      { field: 'fields[0].options', code: 'DUPLICATE' },
    ]);
  });
});

describe('checkFieldKeys', () => {
  const known = new Map<string, FieldType>([[KEY_A, 'number']]);

  it('aceita campo novo e chave conhecida do mesmo tipo', () => {
    expect(
      checkFieldKeys(
        [field(), field({ name: 'Peso', fieldKey: KEY_A })],
        known,
      ),
    ).toEqual([]);
  });

  it('recusa chave desconhecida e troca de tipo', () => {
    expect(checkFieldKeys([field({ fieldKey: KEY_B })], known)).toEqual([
      { field: 'fields[0].fieldKey', code: 'UNKNOWN' },
    ]);
    expect(checkFieldKeys([scale({ fieldKey: KEY_A })], known)).toEqual([
      { field: 'fields[0].fieldType', code: 'TYPE_LOCKED' },
    ]);
  });
});
