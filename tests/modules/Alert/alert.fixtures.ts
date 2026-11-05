import type { AlertRow, AlertRuleRow } from '@/modules/Alert/types/alert.types';

import { ACTOR_ID, PATIENT_ID } from '../Patient/patient.fixtures';

export const RULE_ID = '7777777a-0000-4000-8000-000000000001';
export const ALERT_ID = '7777777a-0000-4000-8000-000000000002';
export const RULE_FORM_ID = '7777777a-0000-4000-8000-000000000003';
export const RULE_FIELD_KEY = '7777777a-0000-4000-8000-000000000004';
export const RULE_FOLLOW_UP_ID = '7777777a-0000-4000-8000-000000000005';

export const ruleRow = (
  overrides: Partial<AlertRuleRow> = {},
): AlertRuleRow => ({
  id: RULE_ID,
  form: { id: RULE_FORM_ID, name: 'Acompanhamento Geral' },
  field: {
    key: RULE_FIELD_KEY,
    name: 'Glicemia capilar',
    fieldType: 'number',
    unit: 'mg/dL',
  },
  patient: null,
  name: 'Glicemia acima de 180',
  description: null,
  operator: 'gt',
  referenceValue: 180,
  severity: 'warning',
  status: 'active',
  createdBy: { id: ACTOR_ID, name: 'Profissional' },
  createdAt: new Date('2026-11-05T12:00:00.000Z'),
  updatedAt: new Date('2026-11-05T12:00:00.000Z'),
  deletedAt: null,
  ...overrides,
});

export const alertRow = (overrides: Partial<AlertRow> = {}): AlertRow => ({
  id: ALERT_ID,
  patient: { id: PATIENT_ID, name: 'Paciente Sintetico' },
  source: 'reading',
  severity: 'warning',
  status: 'open',
  title: 'Glicemia acima de 180',
  message: 'Glicemia capilar: 250 mg/dL (maior que 180 mg/dL).',
  rule: { id: RULE_ID, name: 'Glicemia acima de 180' },
  followUp: {
    id: RULE_FOLLOW_UP_ID,
    visitedAt: new Date('2026-11-05T11:00:00.000Z'),
    status: 'valid',
  },
  field: { key: RULE_FIELD_KEY, name: 'Glicemia capilar', unit: 'mg/dL' },
  value: '250',
  operator: 'gt',
  referenceValue: 180,
  generatedAt: new Date('2026-11-05T12:01:00.000Z'),
  ...overrides,
});
