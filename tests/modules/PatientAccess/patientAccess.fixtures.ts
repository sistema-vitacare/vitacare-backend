import type { PatientLinkRow } from '@/modules/PatientAccess/types/patientAccess.types';

export const LINK_ID = '5555555a-0000-4000-8000-00000000000a';
export const CAREGIVER_ID = '6666666a-0000-4000-8000-00000000000a';

export const linkRow = (
  overrides: Partial<PatientLinkRow> = {},
): PatientLinkRow => ({
  id: LINK_ID,
  patientId: '3333333a-0000-4000-8000-00000000000a',
  patientName: 'Paciente Sintetico',
  patientStatus: 'active',
  userId: CAREGIVER_ID,
  userName: 'Cuidador Sintetico',
  userProfile: 'caregiver',
  userStatus: 'active',
  role: 'caregiver',
  linkType: 'Cuidador contratado',
  note: null,
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  updatedAt: new Date('2026-11-02T10:00:00.000Z'),
  deletedAt: null,
  ...overrides,
});
