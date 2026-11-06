import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FollowUpDto } from '../dtos/followUp.dto';
import { FollowUpErrors } from '../followUp.errors';
import { toFollowUpResponse } from '../parsers/followUp.parser';
import { readsAnnulledFollowUps } from '../policies/followUpVisibility.policy';
import { FollowUpRepository } from '../repositories/followUp.repository';

@Injectable()
export class GetFollowUpUseCase {
  constructor(private readonly followUps: FollowUpRepository) {}

  async execute(followUpId: string, ctx: RequestContext): Promise<FollowUpDto> {
    const followUp = await this.followUps.findById(
      patientScope(ctx),
      followUpId,
      readsAnnulledFollowUps(ctx),
    );

    if (!followUp) {
      throw new DomainException({
        ...FollowUpErrors.NOT_FOUND,
        detail:
          'Registro inexistente, de paciente fora do alcance ou anulado (familiar).',
      });
    }

    return toFollowUpResponse(followUp, ctx);
  }
}
