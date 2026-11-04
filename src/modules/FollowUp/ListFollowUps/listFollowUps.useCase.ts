import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FollowUpDto } from '../dtos/followUp.dto';
import { toFollowUpResponse } from '../parsers/followUp.parser';
import { FollowUpRepository } from '../repositories/followUp.repository';
import type { ListFollowUpsQueryDto } from './listFollowUps.dto';

/** Registros do paciente, da visita mais recente para a mais antiga. */
@Injectable()
export class ListFollowUpsUseCase {
  constructor(private readonly followUps: FollowUpRepository) {}

  async execute(
    query: ListFollowUpsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<FollowUpDto[]>> {
    const result = await this.followUps.list(patientScope(ctx), {
      patientId: query.patientId,
      status: query.status,
      skip: query.skip,
      take: query.limit,
    });

    if (!result) {
      throw new DomainException({
        ...PatientErrors.NOT_FOUND,
        detail: 'Paciente do filtro inexistente ou fora do alcance da sessão.',
      });
    }

    const [items, total] = result;

    return paginate(
      items.map((item) => toFollowUpResponse(item, ctx)),
      total,
      query,
    );
  }
}
