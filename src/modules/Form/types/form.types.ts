export const FIELD_TYPES = [
  'number',
  'scale',
  'boolean',
  'text',
  'single_choice',
  'multiple_choice',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Obrigatorio, Opcional e Desabilitado da Figura 39. */
export const FIELD_REQUIREMENTS = ['required', 'optional', 'disabled'] as const;

export type FieldRequirement = (typeof FIELD_REQUIREMENTS)[number];

export const FORM_STATUSES = ['draft', 'active', 'inactive'] as const;

export type FormStatus = (typeof FORM_STATUSES)[number];

export const FORM_AUDIENCES = ['organization', 'patients'] as const;

export type FormAudience = (typeof FORM_AUDIENCES)[number];

export const FREQUENCY_UNITS = ['hours', 'days', 'weeks'] as const;

export type FrequencyUnit = (typeof FREQUENCY_UNITS)[number];

export type VersionStatus = 'draft' | 'published';

export interface FormFrequency {
  interval: number;
  unit: FrequencyUnit;
}

/** Configuracao de um campo como chega do cliente (ja aparada). */
export interface FormFieldConfig {
  fieldKey?: string;
  name: string;
  fieldType: FieldType;
  requirement: FieldRequirement;
  section: string | null;
  unit: string | null;
  decimalPlaces: number | null;
  scaleMin: number | null;
  scaleMax: number | null;
  options: string[] | null;
}

export interface FormFieldRow extends FormFieldConfig {
  id: string;
  fieldKey: string;
  position: number;
}
