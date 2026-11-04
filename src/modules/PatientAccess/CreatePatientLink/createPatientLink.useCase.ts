import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { PatientErrors } from '@/modules/Patient/patient.errors';

import type { PatientLinkDto } from '../dtos/patientLink.dto';
import { toPatientLinkResponse } from '../parsers/patientLink.parser';
import { PatientAccessErrors } from '../patientAccess.errors';
import { PatientLinkRepository } from '../repositories/patientLink.repository';
import type { CreatePatientLinkDto } from './createPatientLink.dto';

/** UC03 passo 4: vincula cuidador ou familiar a um paciente ativo. */
@Injectable()
export class CreatePatientLinkUseCase {
  constructor(private readonly links: PatientLinkRepository) {}

  async execute(
    input: CreatePatientLinkDto,
    ctx: RequestContext,
  ): Promise<PatientLinkDto> {
    const outcome = await this.links.create({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      patientId: input.patientId,
      userId: input.userId,
      linkType: input.linkType ?? null,
      note: input.note ?? null,
    });

    switch (outcome.kind) {
      case 'patient_not_found':
        throw new DomainException({
          ...PatientErrors.NOT_FOUND,
          detail: 'Paciente inexistente ou fora da organização.',
        });

      case 'patient_inactive':
        throw new DomainException({
          ...PatientErrors.INACTIVE,
          detail: 'Paciente inativo não recebe novos vínculos.',
        });

      case 'invalid_user':
        throw new DomainException({
          ...PatientAccessErrors.INVALID_USER,
          detail:
            'Usuário inexistente, inativo, de outro perfil ou fora da organização.',
          fields: [{ field: 'userId', code: 'INVALID_USER' }],
        });

      case 'already_exists':
        throw new DomainException({
          ...PatientAccessErrors.ALREADY_EXISTS,
          detail: 'Já existe vínculo de cuidado vigente para o par.',
        });

      default:
        return toPatientLinkResponse(outcome.link, ctx);
    }
  }
}
