import { DomainException } from '@/common/errors/domain.exception';

import type { PlanTermFieldsDto } from '../dtos/planTermFields.dto';
import { PlanErrors } from '../plan.errors';
import type { PlanTermInput } from '../types/plan.types';

/** Fim no passado abriria um termo ja vencido: recusado antes do banco. */
export const toPlanTermInput = (
  fields: PlanTermFieldsDto,
  now: Date = new Date(),
): PlanTermInput => {
  const endsAt = fields.endsAt ? new Date(fields.endsAt) : null;

  if (endsAt && endsAt.getTime() <= now.getTime()) {
    throw new DomainException({
      ...PlanErrors.END_IN_PAST,
      detail: 'endsAt anterior ou igual ao instante atual.',
      fields: [{ field: 'endsAt', code: 'IN_PAST' }],
    });
  }

  return {
    endsAt,
    userLimit: fields.userLimit ?? null,
    patientLimit: fields.patientLimit ?? null,
  };
};
