import { ProfileCode } from '@/common/context/requestContext.type';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

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
