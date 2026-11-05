import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { type EnvelopePayload, paginate } from '@/common/http/envelope';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { MedicationDto } from '../dtos/medication.dto';
import { toMedicationResponse } from '../parsers/medication.parser';
import { MedicationRepository } from '../repositories/medication.repository';
import type { ListMedicationsQueryDto } from './listMedications.dto';

/** Medicamentos de um paciente do alcance (Figura 41): ativos primeiro. */
@Injectable()
export class ListMedicationsUseCase {
  constructor(private readonly medications: MedicationRepository) {}

  async execute(
    query: ListMedicationsQueryDto,
    ctx: RequestContext,
  ): Promise<EnvelopePayload<MedicationDto[]>> {
    const outcome = await this.medications.list(patientScope(ctx), {
      patientId: query.patientId,
      status: query.status,
      skip: query.skip,
      take: query.limit,
    });

    if (outcome.kind === 'patient_not_found') {
      throw new DomainException({
        ...PatientErrors.NOT_FOUND,
        detail:
          'Paciente inexistente, fora da organização ou sem vínculo com o usuário.',
      });
    }

    const now = new Date();

    return paginate(
      outcome.items.map((item) =>
        toMedicationResponse(item, outcome.others, ctx, now),
      ),
      outcome.total,
      query,
    );
  }
}
