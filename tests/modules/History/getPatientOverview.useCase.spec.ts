import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import type { AlertRepository } from '@/modules/Alert/repositories/alert.repository';
import { OVERVIEW_NO_FOLLOW_UPS_MESSAGE } from '@/modules/History/GetPatientOverview/getPatientOverview.type';
import { GetPatientOverviewUseCase } from '@/modules/History/GetPatientOverview/getPatientOverview.useCase';
import type { PatientOverviewRepository } from '@/modules/History/repositories/patientOverview.repository';
import type { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';

import { PATIENT_ID, sessionOf } from '../Patient/patient.fixtures';

const overview = { findRecordSummary: jest.fn() };
const medications = { list: jest.fn() };
const alerts = { list: jest.fn() };

const useCase = new GetPatientOverviewUseCase(
  overview as unknown as PatientOverviewRepository,
  medications as unknown as MedicationRepository,
  alerts as unknown as AlertRepository,
);

const summary = { validFollowUps: 0, lastVisitedAt: null, measurements: [] };

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainException);

    return (error as DomainException).code;
  }

  throw new Error('Era esperada uma DomainException.');
};

describe('GetPatientOverviewUseCase', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    overview.findRecordSummary.mockResolvedValue(summary);
    medications.list.mockResolvedValue({
      kind: 'ok',
      items: [],
      total: 0,
      others: [],
    });
    alerts.list.mockResolvedValue({ kind: 'ok', items: [], total: 0 });
  });

  it('fora do alcance: 404 sem consultar medicamentos nem alertas', async () => {
    overview.findRecordSummary.mockResolvedValue(null);

    expect(
      await codeOf(
        useCase.execute(PATIENT_ID, sessionOf(ProfileCode.CAREGIVER)),
      ),
    ).toBe('PATIENT_NOT_FOUND');
    expect(medications.list).not.toHaveBeenCalled();
    expect(alerts.list).not.toHaveBeenCalled();
  });

  it('vinculo revogado entre as consultas: 404 em vez de resposta parcial', async () => {
    alerts.list.mockResolvedValue({ kind: 'patient_not_found' });

    expect(
      await codeOf(useCase.execute(PATIENT_ID, sessionOf(ProfileCode.FAMILY))),
    ).toBe('PATIENT_NOT_FOUND');
  });

  it('sem alerts:read nem medications:read nao consulta esses blocos', async () => {
    const family = sessionOf(ProfileCode.FAMILY);
    const ctx = {
      ...family,
      permissions: new Set(
        [...family.permissions].filter(
          (code) => code !== 'alerts:read' && code !== 'medications:read',
        ),
      ),
    };

    const result = await useCase.execute(PATIENT_ID, ctx);

    expect(medications.list).not.toHaveBeenCalled();
    expect(alerts.list).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      counts: { validFollowUps: 0, openAlerts: null, activeMedications: null },
      activeMedications: null,
      recentAlerts: null,
    });
  });

  it('sem registro valido: meta.message informa a ausencia de dados', async () => {
    const result = await useCase.execute(
      PATIENT_ID,
      sessionOf(ProfileCode.FAMILY),
    );

    expect(result.extras).toEqual({ message: OVERVIEW_NO_FOLLOW_UPS_MESSAGE });
  });

  it('com registro valido: sem meta.message', async () => {
    overview.findRecordSummary.mockResolvedValue({
      ...summary,
      validFollowUps: 1,
      lastVisitedAt: new Date('2026-11-10T12:00:00.000Z'),
    });

    const result = await useCase.execute(
      PATIENT_ID,
      sessionOf(ProfileCode.FAMILY),
    );

    expect(result.extras).toEqual({});
  });
});
