import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { MedicationDto } from '../dtos/medication.dto';
import { MedicationErrors } from '../medication.errors';
import { toMedicationResponse } from '../parsers/medication.parser';
import { MedicationRepository } from '../repositories/medication.repository';

/**
 * "Medicamento removido" do UC08 (a confirmacao e do frontend): inativa,
 * encerra a agenda e preserva o historico.
 */
@Injectable()
export class DeactivateMedicationUseCase {
  constructor(private readonly medications: MedicationRepository) {}

  async execute(
    medicationId: string,
    ctx: RequestContext,
  ): Promise<MedicationDto> {
    const outcome = await this.medications.deactivate({
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

      case 'already_inactive':
        throw new DomainException({
          ...MedicationErrors.ALREADY_INACTIVE,
          detail: 'O medicamento já estava inativo.',
        });

      default:
        return toMedicationResponse(outcome.medication, outcome.others, ctx);
    }
  }
}
