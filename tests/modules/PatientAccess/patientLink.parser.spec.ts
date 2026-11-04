import { ProfileCode } from '@/common/context/requestContext.type';
import {
  toEligibleUserResponse,
  toPatientLinkPatch,
  toPatientLinkResponse,
} from '@/modules/PatientAccess/parsers/patientLink.parser';

import { sessionOf } from '../Patient/patient.fixtures';
import { CAREGIVER_ID, LINK_ID, linkRow } from './patientAccess.fixtures';

describe('patientLink.parser', () => {
  const ctx = sessionOf(ProfileCode.PROFESSIONAL);

  it('vigente sai active com revokedAt nulo e paciente/usuario aninhados', () => {
    expect(toPatientLinkResponse(linkRow(), ctx)).toEqual({
      id: LINK_ID,
      patient: {
        id: '3333333a-0000-4000-8000-00000000000a',
        name: 'Paciente Sintetico',
        status: 'active',
      },
      user: {
        id: CAREGIVER_ID,
        name: 'Cuidador Sintetico',
        profile: 'caregiver',
        status: 'active',
      },
      role: 'caregiver',
      linkType: 'Cuidador contratado',
      note: null,
      status: 'active',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
      revokedAt: null,
    });
  });

  it('revogado sai revoked com a data de deleted_at', () => {
    const response = toPatientLinkResponse(
      linkRow({ deletedAt: new Date('2026-11-03T10:00:00.000Z') }),
      ctx,
    );

    expect(response.status).toBe('revoked');
    expect(response.revokedAt).toBe('2026-11-03T10:00:00.000Z');
  });

  it('patch leva so o que veio; null e mantido para limpar', () => {
    expect(toPatientLinkPatch({})).toEqual({});
    expect(toPatientLinkPatch({ note: null })).toEqual({ note: null });
    expect(toPatientLinkPatch({ linkType: 'Filha' })).toEqual({
      linkType: 'Filha',
    });
  });

  it('usuario elegivel sai so com id, nome, perfil e status', () => {
    expect(
      toEligibleUserResponse({
        id: CAREGIVER_ID,
        name: 'Cuidador',
        profile: 'caregiver',
        status: 'pending',
      }),
    ).toEqual({
      id: CAREGIVER_ID,
      name: 'Cuidador',
      profile: 'caregiver',
      status: 'pending',
    });
  });
});
