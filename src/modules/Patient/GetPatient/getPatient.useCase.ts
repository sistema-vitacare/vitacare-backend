import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PatientDto } from '../dtos/patient.dto';
import { toPatientResponse } from '../parsers/patient.parser';
import { PatientErrors } from '../patient.errors';
import { patientScope } from '../policies/patient.policy';
import { PatientRepository } from '../repositories/patient.repository';

/** Detalhe do paciente, ativo ou inativo, dentro do alcance da sessao. */
@Injectable()
export class GetPatientUseCase {
  constructor(private readonly patients: PatientRepository) {}

  async execute(patientId: string, ctx: RequestContext): Promise<PatientDto> {
    const patient = await this.patients.findById(patientScope(ctx), patientId);

    if (!patient) {
      throw new DomainException({
        ...PatientErrors.NOT_FOUND,
        detail:
          'Paciente inexistente, fora da organização ou sem vínculo com o usuário.',
      });
    }

    return toPatientResponse(patient, ctx);
  }
}
