import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { PatientDto } from '../dtos/patient.dto';
import { toPatientResponse } from '../parsers/patient.parser';
import { PatientErrors } from '../patient.errors';
import { patientScope } from '../policies/patient.policy';
import { PatientRepository } from '../repositories/patient.repository';

/** Reativacao (decisao de 2026-11-04): volta a ativo se houver vaga no plano. */
@Injectable()
export class ReactivatePatientUseCase {
  constructor(private readonly patients: PatientRepository) {}

  async execute(patientId: string, ctx: RequestContext): Promise<PatientDto> {
    const outcome = await this.patients.reactivate({
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

      case 'already_active':
        throw new DomainException({
          ...PatientErrors.ALREADY_ACTIVE,
          detail: 'O paciente já estava ativo.',
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
