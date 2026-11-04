import { ProfileCode } from '@/common/context/requestContext.type';
import { CreatePatientLinkUseCase } from '@/modules/PatientAccess/CreatePatientLink/createPatientLink.useCase';
import type { PatientLinkRepository } from '@/modules/PatientAccess/repositories/patientLink.repository';
import { RevokePatientLinkUseCase } from '@/modules/PatientAccess/RevokePatientLink/revokePatientLink.useCase';
import { UpdatePatientLinkUseCase } from '@/modules/PatientAccess/UpdatePatientLink/updatePatientLink.useCase';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  PATIENT_ID,
  captureError,
  sessionOf,
} from '../Patient/patient.fixtures';
import { CAREGIVER_ID, LINK_ID, linkRow } from './patientAccess.fixtures';

describe('casos de uso de vinculos', () => {
  const links = { create: jest.fn(), update: jest.fn(), revoke: jest.fn() };
  const repository = links as unknown as PatientLinkRepository;
  const ctx = sessionOf(ProfileCode.ADMIN);

  beforeEach(() => jest.resetAllMocks());

  it('cria com organizacao, ator e requestId da sessao e opcionais nulos', async () => {
    links.create.mockResolvedValue({ kind: 'created', link: linkRow() });

    await new CreatePatientLinkUseCase(repository).execute(
      { patientId: PATIENT_ID, userId: CAREGIVER_ID },
      ctx,
    );

    expect(links.create).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      actorUserId: ACTOR_ID,
      requestId: ctx.requestId,
      patientId: PATIENT_ID,
      userId: CAREGIVER_ID,
      linkType: null,
      note: null,
    });
  });

  it.each([
    ['patient_not_found', 'PATIENT_NOT_FOUND', 404],
    ['patient_inactive', 'PATIENT_INACTIVE', 409],
    ['invalid_user', 'PATIENT_LINK_INVALID_USER', 422],
    ['already_exists', 'PATIENT_LINK_ALREADY_EXISTS', 409],
  ])('criar: %s vira %s', async (kind, code, status) => {
    links.create.mockResolvedValue({ kind });

    const error = await captureError(
      new CreatePatientLinkUseCase(repository).execute(
        { patientId: PATIENT_ID, userId: CAREGIVER_ID },
        ctx,
      ),
    );

    expect(error.code).toBe(code);
    expect(error.getStatus()).toBe(status);
  });

  it('editar sem campos e 422 sem tocar o repositorio', async () => {
    const error = await captureError(
      new UpdatePatientLinkUseCase(repository).execute(LINK_ID, {}, ctx),
    );

    expect(error.code).toBe('PATIENT_LINK_NOTHING_TO_UPDATE');
    expect(links.update).not.toHaveBeenCalled();
  });

  it.each([
    ['not_found', 'PATIENT_LINK_NOT_FOUND'],
    ['responsible', 'PATIENT_LINK_RESPONSIBLE_READ_ONLY'],
    ['revoked', 'PATIENT_LINK_REVOKED'],
    ['patient_inactive', 'PATIENT_INACTIVE'],
  ])('editar: %s vira %s', async (kind, code) => {
    links.update.mockResolvedValue({ kind });

    const error = await captureError(
      new UpdatePatientLinkUseCase(repository).execute(
        LINK_ID,
        { note: null },
        ctx,
      ),
    );

    expect(error.code).toBe(code);
  });

  it.each([
    ['not_found', 'PATIENT_LINK_NOT_FOUND'],
    ['responsible', 'PATIENT_LINK_RESPONSIBLE_READ_ONLY'],
    ['already_revoked', 'PATIENT_LINK_REVOKED'],
  ])('revogar: %s vira %s', async (kind, code) => {
    links.revoke.mockResolvedValue({ kind });

    const error = await captureError(
      new RevokePatientLinkUseCase(repository).execute(LINK_ID, ctx),
    );

    expect(error.code).toBe(code);
  });
});
