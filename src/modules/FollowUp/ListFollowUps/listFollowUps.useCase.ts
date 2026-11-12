import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FollowUpDto } from '../dtos/followUp.dto';
import { toFollowUpResponse } from '../parsers/followUp.parser';
import { readsAnnulledFollowUps } from '../policies/followUpVisibility.policy';
import { FollowUpRepository } from '../repositories/followUp.repository';
import { FOLLOW_UPS_EMPTY_MESSAGE } from '../types/followUp.types';
import type { ListFollowUpsQueryDto } from './listFollowUps.dto';

/**
 * Historico do paciente (UC12): registros da visita mais recente para a mais
 * antiga, com os filtros combinados. Periodo sem registro e lista vazia com
 * `meta.message`; o familiar nao ve anulados.
 */
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
      includeAnnulled: readsAnnulledFollowUps(ctx),
      from: query.from,
      to: query.to,
      formId: query.formId,
      authorUserId: query.authorUserId,
      fieldKey: query.fieldKey,
      section: query.section,
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

    const page = paginate(
      items.map((item) => toFollowUpResponse(item, ctx)),
      total,
      query,
    );

    if (total === 0) page.extras.message = FOLLOW_UPS_EMPTY_MESSAGE;

    return page;
  }
}
