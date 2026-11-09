import type { DashboardRepository } from '@/modules/Dashboard/repositories/dashboard.repository';

export const PROFILES = [
  { code: 'admin', name: 'Administrador', active: 1, pending: 0, inactive: 0 },
  {
    code: 'professional',
    name: 'Profissional de saude',
    active: 2,
    pending: 1,
    inactive: 0,
  },
  { code: 'caregiver', name: 'Cuidador', active: 3, pending: 0, inactive: 1 },
  { code: 'family', name: 'Familiar', active: 0, pending: 0, inactive: 0 },
];

export const PRIORITY_READING = {
  id: '9a000000-0000-4000-8000-000000000001',
  patientId: '3333333a-0000-4000-8000-00000000000a',
  patientName: 'Paciente Sintetico',
  source: 'reading' as const,
  severity: 'critical' as const,
  title: 'Saturacao baixa',
  generatedAt: new Date('2026-10-20T12:00:00.000Z'),
  fieldName: 'Saturacao',
  fieldUnit: '%',
  value: '91',
  operator: 'lt',
  referenceValue: '94.000',
  authorId: '5555555a-0000-4000-8000-00000000000a',
  authorName: 'Cuidador Sintetico',
};

export const PRIORITY_ABSENCE = {
  ...PRIORITY_READING,
  id: '9a000000-0000-4000-8000-000000000002',
  source: 'absence' as const,
  severity: 'warning' as const,
  title: 'Ausência de registro',
  fieldName: null,
  fieldUnit: null,
  value: null,
  operator: null,
  referenceValue: null,
  authorId: null,
  authorName: null,
};

export const LATEST = {
  id: '7b000000-0000-4000-8000-000000000001',
  patientId: '3333333a-0000-4000-8000-00000000000a',
  patientName: 'Paciente Sintetico',
  formId: '0b8f5b8e-1c3a-4d55-8f0e-5a0f2c9e7d10',
  formName: 'Sinais vitais',
  authorId: '5555555a-0000-4000-8000-00000000000a',
  authorName: 'Cuidador Sintetico',
  visitedAt: new Date('2026-10-30T13:00:00.000Z'),
};

const severities = { critical: 1, warning: 1, info: 0 };

/** Repositorio simulado com uma organizacao Enterprise e dados conhecidos. */
export const dashboardRepositoryMock = () => ({
  hasDashboard: jest.fn().mockResolvedValue(true),
  patientCounts: jest
    .fn()
    .mockResolvedValue({ active: 4, inactive: 1, newInPeriod: 2 }),
  patientsByResponsible: jest
    .fn()
    .mockResolvedValue([
      { id: '4444444a-0000-4000-8000-00000000000a', name: 'Prof', total: 4 },
    ]),
  usersByProfile: jest.fn().mockResolvedValue(PROFILES),
  countFollowUps: jest.fn().mockResolvedValue(0),
  followUpsByDay: jest.fn().mockResolvedValue([]),
  followUpsByForm: jest.fn().mockResolvedValue([]),
  followUpsByAuthor: jest.fn().mockResolvedValue([]),
  latestFollowUps: jest.fn().mockResolvedValue([]),
  countAlertsIssued: jest.fn().mockResolvedValue(0),
  alertsIssuedBreakdown: jest.fn().mockResolvedValue({
    byDay: [],
    bySeverity: { critical: 0, warning: 0, info: 0 },
    bySource: { reading: 0, absence: 0, medication_reminder: 0 },
    stillOpen: 0,
  }),
  pendingAlerts: jest
    .fn()
    .mockResolvedValue({ total: 2, bySeverity: severities }),
  priorityAlerts: jest
    .fn()
    .mockResolvedValue([PRIORITY_READING, PRIORITY_ABSENCE]),
});

export type DashboardRepositoryMock = ReturnType<
  typeof dashboardRepositoryMock
>;

export const asRepository = (mock: DashboardRepositoryMock) =>
  mock as unknown as DashboardRepository;
