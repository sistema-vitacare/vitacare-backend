import { ProfileCode } from '@/common/context/requestContext.type';
import {
  noCareLinkMessage,
  patientScope,
  readsFullPatientRecord,
} from '@/modules/Patient/policies/patient.policy';
import {
  CAREGIVER_NO_LINK_MESSAGE,
  FAMILY_NO_LINK_MESSAGE,
} from '@/modules/Patient/types/patient.types';

import { ACTOR_ID, ORGANIZATION_ID, sessionOf } from './patient.fixtures';

describe('patientScope', () => {
  it.each([ProfileCode.ADMIN, ProfileCode.PROFESSIONAL] as const)(
    '%s alcanca toda a organizacao',
    (profile) => {
      expect(patientScope(sessionOf(profile))).toEqual({
        organizationId: ORGANIZATION_ID,
        viewerUserId: null,
        viewerLinkRoles: [],
      });
    },
  );

  it.each([
    [ProfileCode.CAREGIVER, 'caregiver'],
    [ProfileCode.FAMILY, 'family'],
  ] as const)(
    '%s so alcanca vinculados no papel do proprio perfil, nunca pelo de responsavel',
    (profile, role) => {
      expect(patientScope(sessionOf(profile))).toEqual({
        organizationId: ORGANIZATION_ID,
        viewerUserId: ACTOR_ID,
        viewerLinkRoles: [role],
      });
    },
  );
});

describe('readsFullPatientRecord', () => {
  it.each([
    [ProfileCode.ADMIN, true],
    [ProfileCode.PROFESSIONAL, true],
    [ProfileCode.CAREGIVER, true],
    [ProfileCode.FAMILY, false],
  ] as const)('%s le o cadastro completo: %s', (profile, expected) => {
    expect(readsFullPatientRecord(sessionOf(profile))).toBe(expected);
  });
});

describe('noCareLinkMessage', () => {
  it.each([
    [ProfileCode.ADMIN, null],
    [ProfileCode.PROFESSIONAL, null],
    [ProfileCode.CAREGIVER, CAREGIVER_NO_LINK_MESSAGE],
    [ProfileCode.FAMILY, FAMILY_NO_LINK_MESSAGE],
  ] as const)('%s sem vinculo recebe: %s', (profile, expected) => {
    expect(noCareLinkMessage(sessionOf(profile))).toBe(expected);
  });
});
