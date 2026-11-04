import type { FollowUpDetail } from '@/modules/FollowUp/types/followUp.types';

export const FOLLOW_UP_ID = '5555555a-0000-4000-8000-00000000000a';
export const FOLLOW_UP_PATIENT_ID = '6666666a-0000-4000-8000-00000000000a';
export const FOLLOW_UP_FORM_ID = '8888888a-0000-4000-8000-00000000000a';
export const FOLLOW_UP_VERSION_ID = '9999999a-0000-4000-8000-00000000000a';
export const GLICEMIA_FIELD_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';

export const followUpDetail = (
  overrides: Partial<FollowUpDetail> = {},
): FollowUpDetail => ({
  id: FOLLOW_UP_ID,
  patientId: FOLLOW_UP_PATIENT_ID,
  formId: FOLLOW_UP_FORM_ID,
  formName: 'Acompanhamento Geral',
  formVersionId: FOLLOW_UP_VERSION_ID,
  formVersionNumber: 1,
  author: { id: '11111111-0000-4000-8000-000000000001', name: 'Ana Cuidadora' },
  visitedAt: new Date('2026-11-04T12:30:00.000Z'),
  submittedAt: new Date('2026-11-04T12:40:00.000Z'),
  notes: 'Paciente relatou melhora na mobilidade.',
  status: 'valid',
  annulledAt: null,
  annulledBy: null,
  annulmentReason: null,
  answers: [
    {
      fieldId: GLICEMIA_FIELD_ID,
      fieldKey: '7a5b3c1d-0000-4000-8000-00000000000a',
      name: 'Glicemia capilar',
      fieldType: 'number',
      unit: 'mg/dL',
      section: 'Sinais vitais',
      position: 0,
      value: '324',
    },
  ],
  ...overrides,
});
