import { ProfileCode } from '@/common/context/requestContext.type';
import { readsAnnulledFollowUps } from '@/modules/FollowUp/policies/followUpVisibility.policy';

import { sessionOf } from '../Patient/patient.fixtures';

describe('readsAnnulledFollowUps', () => {
  it.each([
    [ProfileCode.ADMIN, true],
    [ProfileCode.PROFESSIONAL, true],
    [ProfileCode.CAREGIVER, true],
    [ProfileCode.FAMILY, false],
  ] as const)('%s ve registros anulados: %s', (profile, expected) => {
    expect(readsAnnulledFollowUps(sessionOf(profile))).toBe(expected);
  });
});
