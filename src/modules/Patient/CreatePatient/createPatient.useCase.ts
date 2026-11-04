import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PatientDto } from '../dtos/patient.dto';
import { toPatientFields, toPatientResponse } from '../parsers/patient.parser';
import { PatientErrors } from '../patient.errors';
import { patientScope } from '../policies/patient.policy';
import { PatientRepository } from '../repositories/patient.repository';
import type { CreatePatientDto } from './createPatient.dto';

/**
 * Cadastro do UC07 (passos 2 a 5): dados do paciente e vinculo com o
 * profissional responsavel, numa transacao que respeita o limite de pacientes
 * ativos do plano.
 */
@Injectable()
export class CreatePatientUseCase {
  constructor(private readonly patients: PatientRepository) {}

  async execute(
    input: CreatePatientDto,
    ctx: RequestContext,
  ): Promise<PatientDto> {
    const outcome = await this.patients.create({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      fields: toPatientFields(input),
      responsibleUserId: input.responsibleUserId,
    });

    switch (outcome.kind) {
      case 'invalid_responsible':
        throw new DomainException({
          ...PatientErrors.INVALID_RESPONSIBLE,
          detail:
            'Responsável inexistente, inativo, de outro perfil ou fora da organização.',
          fields: [{ field: 'responsibleUserId', code: 'INVALID_RESPONSIBLE' }],
        });

      case 'plan_expired':
        throw new DomainException({
          ...PatientErrors.PLAN_EXPIRED,
          detail: 'O termo corrente do plano da organização está vencido.',
        });

      case 'limit_reached':
        throw new DomainException({
          ...PatientErrors.PLAN_LIMIT_REACHED,
          detail: 'Pacientes ativos já ocupam o limite do plano.',
        });

      default:
        return toPatientResponse(outcome.patient, ctx);
    }
  }
}
