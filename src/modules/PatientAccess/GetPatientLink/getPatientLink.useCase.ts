import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PatientLinkDto } from '../dtos/patientLink.dto';
import { toPatientLinkResponse } from '../parsers/patientLink.parser';
import { PatientAccessErrors } from '../patientAccess.errors';
import { PatientLinkRepository } from '../repositories/patientLink.repository';

/** Detalhe de um vinculo, vigente ou revogado. */
@Injectable()
export class GetPatientLinkUseCase {
  constructor(private readonly links: PatientLinkRepository) {}

  async execute(linkId: string, ctx: RequestContext): Promise<PatientLinkDto> {
    const link = await this.links.findById(ctx.organizationId, linkId);

    if (!link) {
      throw new DomainException({
        ...PatientAccessErrors.NOT_FOUND,
        detail: 'Vínculo inexistente ou fora da organização.',
      });
    }

    return toPatientLinkResponse(link, ctx);
  }
}
