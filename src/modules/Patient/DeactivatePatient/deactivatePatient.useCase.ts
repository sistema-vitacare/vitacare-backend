import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PatientDto } from '../dtos/patient.dto';
import { toPatientResponse } from '../parsers/patient.parser';
import { PatientErrors } from '../patient.errors';
import { patientScope } from '../policies/patient.policy';
import { PatientRepository } from '../repositories/patient.repository';

/**
 * Inativacao do UC07 (a confirmacao e do frontend): libera a vaga, tira o
 * paciente da listagem principal e preserva vinculos e historico.
 */
@Injectable()
export class DeactivatePatientUseCase {
  constructor(private readonly patients: PatientRepository) {}

  async execute(patientId: string, ctx: RequestContext): Promise<PatientDto> {
    const outcome = await this.patients.deactivate({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      patientId,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...PatientErrors.NOT_FOUND,
          detail:
            'Paciente inexistente, fora da organização ou sem vínculo com o usuário.',
        });

      case 'already_inactive':
        throw new DomainException({
          ...PatientErrors.ALREADY_INACTIVE,
          detail: 'O paciente já estava inativo.',
        });

      default:
        return toPatientResponse(outcome.patient, ctx);
    }
  }
}
