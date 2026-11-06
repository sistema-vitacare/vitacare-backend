import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { FollowUpErrors } from '@/modules/FollowUp/followUp.errors';
import { readsAnnulledFollowUps } from '@/modules/FollowUp/policies/followUpVisibility.policy';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { AttachmentDto } from '../dtos/attachment.dto';
import { toAttachmentResponse } from '../parsers/attachment.parser';
import { AttachmentRepository } from '../repositories/attachment.repository';

@Injectable()
export class ListAttachmentsUseCase {
  constructor(private readonly attachments: AttachmentRepository) {}

  async execute(
    followUpId: string,
    ctx: RequestContext,
  ): Promise<AttachmentDto[]> {
    const rows = await this.attachments.list(
      patientScope(ctx),
      followUpId,
      readsAnnulledFollowUps(ctx),
    );

    if (!rows) {
      throw new DomainException({
        ...FollowUpErrors.NOT_FOUND,
        detail:
          'Registro inexistente, de paciente fora do alcance ou anulado (familiar).',
      });
    }

    return rows.map((row) => toAttachmentResponse(row, ctx));
  }
}
