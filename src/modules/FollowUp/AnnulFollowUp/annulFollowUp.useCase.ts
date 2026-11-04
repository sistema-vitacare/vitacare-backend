import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { Permissions } from '@/modules/Access/access.permissions';
import { hasPermission } from '@/modules/Access/policies/access.policy';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { FollowUpDto } from '../dtos/followUp.dto';
import { FollowUpErrors } from '../followUp.errors';
import { toFollowUpResponse } from '../parsers/followUp.parser';
import { FollowUpRepository } from '../repositories/followUp.repository';
import type { AnnulFollowUpDto } from './annulFollowUp.dto';

/**
 * Correcao por anulacao (decisao de Mateus, 2026-11-04): o registro deixa de
 * valer, com motivo, e continua no historico. Admin e profissional
 * (`follow_ups:annul`) anulam qualquer registro da organizacao; o cuidador so
 * os proprios, de paciente ainda vinculado.
 */
@Injectable()
export class AnnulFollowUpUseCase {
  constructor(private readonly followUps: FollowUpRepository) {}

  async execute(
    followUpId: string,
    dto: AnnulFollowUpDto,
    ctx: RequestContext,
  ): Promise<FollowUpDto> {
    const outcome = await this.followUps.annul({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      followUpId,
      reason: dto.reason,
      annulAny: hasPermission(ctx, Permissions.FOLLOW_UPS_ANNUL),
    });

    switch (outcome.kind) {
      case 'annulled':
        return toFollowUpResponse(outcome.followUp, ctx);
      case 'not_found':
        throw new DomainException({
          ...FollowUpErrors.NOT_FOUND,
          detail: 'Registro inexistente ou de paciente fora do alcance.',
        });
      case 'not_author':
        throw new DomainException({
          ...FollowUpErrors.NOT_AUTHOR,
          detail: 'Sem follow_ups:annul, so o autor anula o registro.',
        });
      case 'already_annulled':
        throw new DomainException({
          ...FollowUpErrors.ALREADY_ANNULLED,
          detail: 'A anulacao e unica e irreversivel.',
        });
    }
  }
}
