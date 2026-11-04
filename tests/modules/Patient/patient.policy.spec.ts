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
      });
    },
  );

  it.each([ProfileCode.CAREGIVER, ProfileCode.FAMILY] as const)(
    '%s so alcanca pacientes vinculados',
    (profile) => {
      expect(patientScope(sessionOf(profile))).toEqual({
        organizationId: ORGANIZATION_ID,
        viewerUserId: ACTOR_ID,
      });
    },
  );
});
