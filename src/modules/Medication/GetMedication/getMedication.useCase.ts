import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { MedicationDto } from '../dtos/medication.dto';
import { MedicationErrors } from '../medication.errors';
import { toMedicationResponse } from '../parsers/medication.parser';
import { MedicationRepository } from '../repositories/medication.repository';

@Injectable()
export class GetMedicationUseCase {
  constructor(private readonly medications: MedicationRepository) {}

  async execute(
    medicationId: string,
    ctx: RequestContext,
  ): Promise<MedicationDto> {
    const view = await this.medications.findById(
      patientScope(ctx),
      medicationId,
    );

    if (!view) {
      throw new DomainException({
        ...MedicationErrors.NOT_FOUND,
        detail:
          'Medicamento inexistente, fora da organização ou de paciente sem vínculo com o usuário.',
      });
    }

    return toMedicationResponse(view.medication, view.others, ctx);
  }
}
