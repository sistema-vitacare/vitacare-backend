import { DeactivatePatientUseCase } from '@/modules/Patient/DeactivatePatient/deactivatePatient.useCase';
import { GetPatientUseCase } from '@/modules/Patient/GetPatient/getPatient.useCase';
import { ReactivatePatientUseCase } from '@/modules/Patient/ReactivatePatient/reactivatePatient.useCase';
import type { PatientRepository } from '@/modules/Patient/repositories/patient.repository';

import {
  PATIENT_ID,
  captureError,
  patientRow,
  professionalCtx,
} from './patient.fixtures';

describe('consulta, inativacao e reativacao de paciente', () => {
  const patients = {
    findById: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
  };
  const repository = patients as unknown as PatientRepository;

  beforeEach(() => jest.resetAllMocks());

  it('consulta responde 404 fora do alcance', async () => {
    patients.findById.mockResolvedValue(null);

    const error = await captureError(
      new GetPatientUseCase(repository).execute(PATIENT_ID, professionalCtx),
    );

    expect(error.code).toBe('PATIENT_NOT_FOUND');
  });

  it.each([
    ['not_found', 'PATIENT_NOT_FOUND', 404],
    ['already_inactive', 'PATIENT_ALREADY_INACTIVE', 409],
  ])('inativar: %s vira %s', async (kind, code, status) => {
    patients.deactivate.mockResolvedValue({ kind });

    const error = await captureError(
      new DeactivatePatientUseCase(repository).execute(
        PATIENT_ID,
        professionalCtx,
      ),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });

  it.each([
    ['not_found', 'PATIENT_NOT_FOUND', 404],
    ['already_active', 'PATIENT_ALREADY_ACTIVE', 409],
    ['plan_expired', 'PATIENT_PLAN_EXPIRED', 409],
    ['limit_reached', 'PATIENT_PLAN_LIMIT_REACHED', 409],
  ])('reativar: %s vira %s', async (kind, code, status) => {
    patients.reactivate.mockResolvedValue({ kind });

    const error = await captureError(
      new ReactivatePatientUseCase(repository).execute(
        PATIENT_ID,
        professionalCtx,
      ),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });

  it('reativar devolve o paciente ativo', async () => {
    patients.reactivate.mockResolvedValue({
      kind: 'reactivated',
      patient: patientRow(),
    });

    await expect(
      new ReactivatePatientUseCase(repository).execute(
        PATIENT_ID,
        professionalCtx,
      ),
    ).resolves.toMatchObject({ status: 'active' });
  });
});
