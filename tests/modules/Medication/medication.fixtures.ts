import type {
  ConflictSource,
  MedicationRow,
} from '@/modules/Medication/types/medication.types';

import { ACTOR_ID, PATIENT_ID } from '../Patient/patient.fixtures';

export const MEDICATION_ID = '5555555a-0000-4000-8000-00000000000a';
export const OTHER_MEDICATION_ID = '5555555b-0000-4000-8000-00000000000b';

export const medicationRow = (
  overrides: Partial<MedicationRow> = {},
): MedicationRow => ({
  id: MEDICATION_ID,
  patientId: PATIENT_ID,
  name: 'Losartana potassica',
  doseAmount: 50,
  doseUnit: 'mg',
  route: 'oral',
  notes: null,
  remindersEnabled: true,
  status: 'active',
  schedule: {
    startDate: '2026-11-01',
    endDate: null,
    intervalDays: 1,
    times: ['08:00', '20:00'],
  },
  createdById: ACTOR_ID,
  createdByName: 'Profissional Sintetico',
  createdAt: new Date('2026-11-01T12:00:00Z'),
  updatedAt: new Date('2026-11-01T12:00:00Z'),
  deletedAt: null,
  ...overrides,
});

export const conflictSource = (
  overrides: Partial<ConflictSource> = {},
): ConflictSource => ({
  id: OTHER_MEDICATION_ID,
  name: 'Metformina',
  patientId: PATIENT_ID,
  schedule: {
    startDate: '2026-11-01',
    endDate: null,
    intervalDays: 1,
    times: ['20:00'],
  },
  ...overrides,
});
