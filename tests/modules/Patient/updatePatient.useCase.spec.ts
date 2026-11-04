import type { PatientRepository } from '@/modules/Patient/repositories/patient.repository';
import { UpdatePatientUseCase } from '@/modules/Patient/UpdatePatient/updatePatient.useCase';

import {
  PATIENT_ID,
  RESPONSIBLE_ID,
  captureError,
  patientRow,
  professionalCtx,
} from './patient.fixtures';

describe('UpdatePatientUseCase', () => {
  const patients = { update: jest.fn() };
  const useCase = new UpdatePatientUseCase(
    patients as unknown as PatientRepository,
  );

  beforeEach(() => jest.resetAllMocks());

  it('recusa corpo vazio sem chamar o banco', async () => {
    const error = await captureError(
      useCase.execute(PATIENT_ID, {}, professionalCtx),
    );

    expect(error.code).toBe('PATIENT_NOTHING_TO_UPDATE');
    expect(error.getStatus()).toBe(422);
    expect(patients.update).not.toHaveBeenCalled();
  });

  it('envia so o patch e o responsavel informados', async () => {
    patients.update.mockResolvedValue({
      kind: 'updated',
      patient: patientRow(),
    });

    await useCase.execute(
      PATIENT_ID,
      { notes: null, responsibleUserId: RESPONSIBLE_ID },
      professionalCtx,
    );

    expect(patients.update).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: PATIENT_ID,
        patch: { notes: null },
        responsibleUserId: RESPONSIBLE_ID,
      }),
    );
  });

  it.each([
    ['not_found', 'PATIENT_NOT_FOUND', 404],
    ['inactive', 'PATIENT_INACTIVE', 409],
    ['invalid_responsible', 'PATIENT_INVALID_RESPONSIBLE', 422],
  ])('%s vira %s', async (kind, code, status) => {
    patients.update.mockResolvedValue({ kind });

    const error = await captureError(
      useCase.execute(PATIENT_ID, { name: 'Outro' }, professionalCtx),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });
});
