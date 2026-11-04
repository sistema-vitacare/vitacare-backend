import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { PatientErrors } from '@/modules/Patient/patient.errors';

import type { PatientLinkDto } from '../dtos/patientLink.dto';
import {
  toPatientLinkPatch,
  toPatientLinkResponse,
} from '../parsers/patientLink.parser';
import { PatientAccessErrors } from '../patientAccess.errors';
import { PatientLinkRepository } from '../repositories/patientLink.repository';
import type { UpdatePatientLinkDto } from './updatePatientLink.dto';

/** Ajusta tipo e observacao de um vinculo de cuidado vigente. */
@Injectable()
export class UpdatePatientLinkUseCase {
  constructor(private readonly links: PatientLinkRepository) {}

  async execute(
    linkId: string,
    input: UpdatePatientLinkDto,
    ctx: RequestContext,
  ): Promise<PatientLinkDto> {
    const patch = toPatientLinkPatch(input);

    if (Object.keys(patch).length === 0) {
      throw new DomainException({
        ...PatientAccessErrors.NOTHING_TO_UPDATE,
        detail: 'Corpo sem nenhum campo editável.',
      });
    }

    const outcome = await this.links.update({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      linkId,
      patch,
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
          detail: 'Vínculo de responsável não é editado nesta rota.',
        });

      case 'revoked':
        throw new DomainException({
          ...PatientAccessErrors.REVOKED,
          detail: 'Vínculo revogado não é editado.',
        });

      case 'patient_inactive':
        throw new DomainException({
          ...PatientErrors.INACTIVE,
          detail: 'Vínculo de paciente inativo não é editado.',
        });

      default:
        return toPatientLinkResponse(outcome.link, ctx);
    }
  }
}
