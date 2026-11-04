import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PatientDto } from '../dtos/patient.dto';
import { toPatientPatch, toPatientResponse } from '../parsers/patient.parser';
import { PatientErrors } from '../patient.errors';
import { patientScope } from '../policies/patient.policy';
import { PatientRepository } from '../repositories/patient.repository';
import type { UpdatePatientDto } from './updatePatient.dto';

/** Edicao do UC07; paciente inativo precisa ser reativado antes. */
@Injectable()
export class UpdatePatientUseCase {
  constructor(private readonly patients: PatientRepository) {}

  async execute(
    patientId: string,
    input: UpdatePatientDto,
    ctx: RequestContext,
  ): Promise<PatientDto> {
    const patch = toPatientPatch(input);

    if (
      Object.keys(patch).length === 0 &&
      input.responsibleUserId === undefined
    ) {
      throw new DomainException({
        ...PatientErrors.NOTHING_TO_UPDATE,
        detail: 'Corpo sem nenhum campo editável.',
      });
    }

    const outcome = await this.patients.update({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      patientId,
      patch,
      responsibleUserId: input.responsibleUserId,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...PatientErrors.NOT_FOUND,
          detail:
            'Paciente inexistente, fora da organização ou sem vínculo com o usuário.',
        });

      case 'inactive':
        throw new DomainException({
          ...PatientErrors.INACTIVE,
          detail: 'Paciente inativo não é editado.',
        });

      case 'invalid_responsible':
        throw new DomainException({
          ...PatientErrors.INVALID_RESPONSIBLE,
          detail:
            'Responsável inexistente, inativo, de outro perfil ou fora da organização.',
          fields: [{ field: 'responsibleUserId', code: 'INVALID_RESPONSIBLE' }],
        });

      default:
        return toPatientResponse(outcome.patient, ctx);
    }
  }
}
