import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { MedicationDto } from '../dtos/medication.dto';
import { MedicationErrors } from '../medication.errors';
import { toMedicationResponse } from '../parsers/medication.parser';
import { MedicationRepository } from '../repositories/medication.repository';

/**
 * Reativacao (decisao de 2026-11-05): a agenda encerrada na inativacao volta a
 * valer a partir de agora; horarios perdidos no intervalo nao sao recuperados.
 */
@Injectable()
export class ReactivateMedicationUseCase {
  constructor(private readonly medications: MedicationRepository) {}

  async execute(
    medicationId: string,
    ctx: RequestContext,
  ): Promise<MedicationDto> {
    const outcome = await this.medications.reactivate({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      medicationId,
    });

    switch (outcome.kind) {
      case 'not_found':
        throw new DomainException({
          ...MedicationErrors.NOT_FOUND,
          detail: 'Medicamento inexistente ou fora da organização.',
        });

      case 'already_active':
        throw new DomainException({
          ...MedicationErrors.ALREADY_ACTIVE,
          detail: 'O medicamento já estava ativo.',
        });

      case 'patient_inactive':
        throw new DomainException({
          ...MedicationErrors.PATIENT_INACTIVE,
          detail: 'Medicamento de paciente inativo não é reativado.',
        });

      default:
        return toMedicationResponse(outcome.medication, outcome.others, ctx);
    }
  }
}
