import type { ManagementReportRepository } from '@/modules/ManagementReport/repositories/managementReport.repository';
import type {
  AlertSummaryRow,
  CaregiverActivityRow,
  IntercurrenceRow,
  StatusCounts,
} from '@/modules/ManagementReport/types/managementReport.types';

import { ORGANIZATION_ID } from '../Patient/patient.fixtures';

export const PATIENT_A = '3333333a-0000-4000-8000-00000000000a';
export const CAREGIVER_ID = '5555555a-0000-4000-8000-00000000000a';

const counts = (total = 0, open = 0): StatusCounts => ({
  total,
  open,
  resolved: total - open,
});

const noResolution = {
  resolved: 0,
  averageSeconds: null,
  medianSeconds: null,
};

export const alertSummary = (
  overrides: Partial<AlertSummaryRow> = {},
): AlertSummaryRow => ({
  totals: { total: 6, open: 2, resolved: 4, intercurrences: 2 },
  bySource: {
    reading: counts(3, 1),
    absence: counts(2, 1),
    medication_reminder: counts(1, 0),
  },
  bySeverity: {
    critical: counts(2, 1),
    warning: counts(3, 1),
    info: counts(1, 0),
  },
  resolution: {
    resolved: 4,
    averageSeconds: 5400,
    medianSeconds: 3600,
    bySeverity: {
      critical: { resolved: 1, averageSeconds: 7200, medianSeconds: 7200 },
      warning: { resolved: 2, averageSeconds: 3600, medianSeconds: 3600 },
      info: noResolution,
    },
  },
  ...overrides,
});

export const EMPTY_SUMMARY = alertSummary({
  totals: { total: 0, open: 0, resolved: 0, intercurrences: 0 },
  bySource: {
    reading: counts(),
    absence: counts(),
    medication_reminder: counts(),
  },
  bySeverity: { critical: counts(), warning: counts(), info: counts() },
  resolution: {
    ...noResolution,
    bySeverity: {
      critical: noResolution,
      warning: noResolution,
      info: noResolution,
    },
  },
});

export const intercurrence = (
  overrides: Partial<IntercurrenceRow> = {},
): IntercurrenceRow => ({
  id: '9a000000-0000-4000-8000-000000000001',
  generatedAt: new Date('2026-10-20T12:00:00.000Z'),
  source: 'reading',
  patientId: PATIENT_A,
  patientName: 'Paciente Sintetico',
  subject: 'Glicemia',
  status: 'resolved',
  resolvedAt: new Date('2026-10-20T14:00:00.000Z'),
  secondsToResolve: 7200,
  ...overrides,
});

export const caregiverRow = (
  overrides: Partial<CaregiverActivityRow> = {},
): CaregiverActivityRow => ({
  id: CAREGIVER_ID,
  name: 'Cuidador Sintetico',
  status: 'active',
  profile: 'caregiver',
  linkedPatients: 3,
  validFollowUps: 5,
  annulledFollowUps: 1,
  patientsWithFollowUp: 2,
  absenceAlerts: 1,
  resolvedAlerts: 2,
  ...overrides,
});

export const managementReportRepositoryMock = () => ({
  hasManagementReports: jest.fn().mockResolvedValue(true),
  organization: jest
    .fn()
    .mockResolvedValue({ id: ORGANIZATION_ID, name: 'Clinica Sintetica' }),
  alertSummary: jest.fn().mockResolvedValue(alertSummary()),
  alertsByDay: jest.fn().mockResolvedValue([]),
  topPatients: jest.fn().mockResolvedValue([]),
  intercurrences: jest.fn().mockResolvedValue([]),
  caregiverActivity: jest.fn().mockResolvedValue([]),
  caregiverSummary: jest
    .fn()
    .mockResolvedValue({ linkedPatients: 0, absenceAlerts: 0 }),
  exportCounts: jest.fn().mockResolvedValue({
    patient_follow_up: 0,
    alerts: 0,
    caregiver_activity: 0,
  }),
  recentExports: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
  recordExport: jest.fn().mockResolvedValue(undefined),
});

export type ManagementReportRepositoryMock = ReturnType<
  typeof managementReportRepositoryMock
>;

export const asRepository = (
  mock: ManagementReportRepositoryMock,
): ManagementReportRepository => mock as unknown as ManagementReportRepository;
