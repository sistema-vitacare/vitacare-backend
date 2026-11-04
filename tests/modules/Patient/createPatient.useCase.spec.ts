import { CreatePatientUseCase } from '@/modules/Patient/CreatePatient/createPatient.useCase';
import type { PatientRepository } from '@/modules/Patient/repositories/patient.repository';
import type { CreatePatientCommand } from '@/modules/Patient/types/patient.types';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  RESPONSIBLE_ID,
  captureError,
  patientRow,
  professionalCtx,
} from './patient.fixtures';

describe('CreatePatientUseCase', () => {
  const patients = { create: jest.fn() };
  const useCase = new CreatePatientUseCase(
    patients as unknown as PatientRepository,
  );
  const input = {
    name: 'Paciente Sintetico',
    birthDate: '1948-03-12',
    responsibleUserId: RESPONSIBLE_ID,
  };

  beforeEach(() => jest.resetAllMocks());

  it('envia organizacao, ator e responsavel da sessao e devolve o paciente', async () => {
    patients.create.mockResolvedValue({
      kind: 'created',
      patient: patientRow(),
    });

    const response = await useCase.execute(input, professionalCtx);

    const [[command]] = patients.create.mock.calls as [[CreatePatientCommand]];

    expect(command).toMatchObject({
      organizationId: ORGANIZATION_ID,
      viewerUserId: null,
      actorUserId: ACTOR_ID,
      requestId: professionalCtx.requestId,
      responsibleUserId: RESPONSIBLE_ID,
      fields: { name: 'Paciente Sintetico', cpf: null },
    });
    expect(response.cpf).toBe('52998224725');
  });

  it.each([
    ['invalid_responsible', 'PATIENT_INVALID_RESPONSIBLE', 422],
    ['plan_expired', 'PATIENT_PLAN_EXPIRED', 409],
    ['limit_reached', 'PATIENT_PLAN_LIMIT_REACHED', 409],
  ])('%s vira %s', async (kind, code, status) => {
    patients.create.mockResolvedValue({ kind });

    const error = await captureError(useCase.execute(input, professionalCtx));

    expect(error.getStatus()).toBe(status);
    expect(error.code).toBe(code);
  });
});
