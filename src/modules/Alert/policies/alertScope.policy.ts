import type { RequestContext } from '@/common/context/requestContext.type';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { AlertScope } from '../types/alert.types';

/** Alcance de pacientes da sessao e o proprio usuario, dono da leitura. */
export const alertScope = (ctx: RequestContext): AlertScope => ({
  ...patientScope(ctx),
  viewerId: ctx.userId,
});
