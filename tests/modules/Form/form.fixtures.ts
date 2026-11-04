import type { FormDetail, FormFieldRow } from '@/modules/Form/types/form.types';

export const FORM_ID = '8888888a-0000-4000-8000-00000000000a';
export const VERSION_ID = '9999999a-0000-4000-8000-00000000000a';
export const DRAFT_ID = '9999999b-0000-4000-8000-00000000000b';
export const FIELD_KEY = '7a5b3c1d-0000-4000-8000-00000000000a';

export const fieldRow = (
  overrides: Partial<FormFieldRow> = {},
): FormFieldRow => ({
  id: 'aaaaaaaa-0000-4000-8000-00000000000a',
  fieldKey: FIELD_KEY,
  name: 'Glicemia capilar',
  fieldType: 'number',
  requirement: 'required',
  position: 0,
  section: 'Sinais vitais',
  unit: 'mg/dL',
  decimalPlaces: 0,
  scaleMin: null,
  scaleMax: null,
  options: null,
  ...overrides,
});

export const formDetail = (
  overrides: Partial<FormDetail> = {},
): FormDetail => ({
  id: FORM_ID,
  name: 'Acompanhamento Geral',
  description: null,
  trackingType: 'Dados clinicos',
  status: 'active',
  audience: 'organization',
  patientIds: [],
  frequencyInterval: 1,
  frequencyUnit: 'days',
  currentVersionId: VERSION_ID,
  currentVersionNumber: 1,
  currentPublishedAt: new Date('2026-11-02T10:00:00.000Z'),
  currentFieldCount: 1,
  hasDraft: true,
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  updatedAt: new Date('2026-11-02T10:00:00.000Z'),
  deletedAt: null,
  currentFields: [fieldRow()],
  draft: {
    id: DRAFT_ID,
    updatedAt: new Date('2026-11-03T10:00:00.000Z'),
    fields: [fieldRow({ id: 'bbbbbbbb-0000-4000-8000-00000000000b' })],
  },
  ...overrides,
});
