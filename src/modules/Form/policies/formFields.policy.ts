import type { FieldError } from '@/common/errors/domainError.type';

import type { FieldType, FormFieldConfig } from '../types/form.types';

type TypedProperty =
  'unit' | 'decimalPlaces' | 'scaleMin' | 'scaleMax' | 'options';

const TYPED_PROPERTIES: readonly TypedProperty[] = [
  'unit',
  'decimalPlaces',
  'scaleMin',
  'scaleMax',
  'options',
];

/** O que cada tipo exige e o que aceita alem disso; o resto e proibido. */
const TYPE_RULES: Readonly<
  Record<
    FieldType,
    { required: readonly TypedProperty[]; optional: readonly TypedProperty[] }
  >
> = {
  number: { required: ['decimalPlaces'], optional: ['unit'] },
  scale: { required: ['scaleMin', 'scaleMax'], optional: [] },
  boolean: { required: [], optional: [] },
  text: { required: [], optional: [] },
  single_choice: { required: ['options'], optional: [] },
  multiple_choice: { required: ['options'], optional: [] },
};

const normalize = (text: string): string => text.trim().toLowerCase();

const hasDuplicate = (values: readonly string[]): boolean =>
  new Set(values.map(normalize)).size !== values.length;

/**
 * Coerencia de cada campo com o seu tipo e unicidade de nome e chave na
 * versao. Faixas e tamanhos ficam com o DTO; lista vazia, com o caso de uso.
 */
export const checkFormFields = (fields: FormFieldConfig[]): FieldError[] => {
  const errors: FieldError[] = [];
  const names = new Set<string>();
  const keys = new Set<string>();

  fields.forEach((field, index) => {
    const path = (property: string) => `fields[${index}].${property}`;
    const rules = TYPE_RULES[field.fieldType];

    for (const property of TYPED_PROPERTIES) {
      const present = field[property] !== null && field[property] !== undefined;

      if (rules.required.includes(property)) {
        if (!present) errors.push({ field: path(property), code: 'REQUIRED' });
      } else if (present && !rules.optional.includes(property)) {
        errors.push({ field: path(property), code: 'NOT_ALLOWED' });
      }
    }

    if (
      field.fieldType === 'scale' &&
      field.scaleMin !== null &&
      field.scaleMax !== null &&
      field.scaleMin >= field.scaleMax
    ) {
      errors.push({ field: path('scaleMax'), code: 'INVALID_RANGE' });
    }

    if (rules.required.includes('options') && field.options) {
      if (hasDuplicate(field.options)) {
        errors.push({ field: path('options'), code: 'DUPLICATE' });
      }
    }

    const name = normalize(field.name);

    if (names.has(name))
      errors.push({ field: path('name'), code: 'DUPLICATE' });
    names.add(name);

    if (field.fieldKey) {
      if (keys.has(field.fieldKey)) {
        errors.push({ field: path('fieldKey'), code: 'DUPLICATE' });
      }
      keys.add(field.fieldKey);
    }
  });

  return errors;
};

/**
 * `fieldKey` informado tem de existir em `known` (versoes publicadas e
 * rascunho vivo do mesmo formulario) e manter o tipo: mudar o tipo e criar
 * campo novo.
 */
export const checkFieldKeys = (
  fields: FormFieldConfig[],
  known: ReadonlyMap<string, FieldType>,
): FieldError[] =>
  fields.flatMap((field, index): FieldError[] => {
    if (!field.fieldKey) return [];

    const knownType = known.get(field.fieldKey);

    if (knownType === undefined) {
      return [{ field: `fields[${index}].fieldKey`, code: 'UNKNOWN' }];
    }

    return knownType === field.fieldType
      ? []
      : [{ field: `fields[${index}].fieldType`, code: 'TYPE_LOCKED' }];
  });
