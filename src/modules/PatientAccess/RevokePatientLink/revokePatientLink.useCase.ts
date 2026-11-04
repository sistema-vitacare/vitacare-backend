import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PatientLinkDto } from '../dtos/patientLink.dto';
import { toPatientLinkResponse } from '../parsers/patientLink.parser';
import { PatientAccessErrors } from '../patientAccess.errors';
import { PatientLinkRepository } from '../repositories/patientLink.repository';

/** Revoga o vinculo de cuidado, inclusive de paciente inativo. */
@Injectable()
export class RevokePatientLinkUseCase {
  constructor(private readonly links: PatientLinkRepository) {}

  async execute(linkId: string, ctx: RequestContext): Promise<PatientLinkDto> {
    const outcome = await this.links.revoke({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      linkId,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...PatientAccessErrors.NOT_FOUND,
          detail: 'Vínculo inexistente ou fora da organização.',
        });

      case 'responsible':
        throw new DomainException({
          ...PatientAccessErrors.RESPONSIBLE_READ_ONLY,
          detail: 'Vínculo de responsável não é revogado nesta rota.',
        });

      case 'already_revoked':
        throw new DomainException({
          ...PatientAccessErrors.REVOKED,
          detail: 'Vínculo já revogado.',
        });

      default:
        return toPatientLinkResponse(outcome.link, ctx);
    }
  }
}
