import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { PatientErrors } from '@/modules/Patient/patient.errors';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { MedicationDto } from '../dtos/medication.dto';
import { MedicationErrors } from '../medication.errors';
import {
  toMedicationInput,
  toMedicationResponse,
} from '../parsers/medication.parser';
import { todayInBrazil } from '../policies/medicationSchedule.policy';
import { MedicationRepository } from '../repositories/medication.repository';
import type { CreateMedicationDto } from './createMedication.dto';

/**
 * UC08: cadastra o medicamento e programa a agenda numa transacao. A
 * sobreposicao de horarios volta em `scheduleConflicts`, sem bloquear.
 */
@Injectable()
export class CreateMedicationUseCase {
  constructor(private readonly medications: MedicationRepository) {}

  async execute(
    dto: CreateMedicationDto,
    ctx: RequestContext,
  ): Promise<MedicationDto> {
    const outcome = await this.medications.create({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      patientId: dto.patientId,
      ...toMedicationInput(dto, todayInBrazil()),
    });

    switch (outcome.kind) {
      case 'patient_not_found':
        throw new DomainException({
          ...PatientErrors.NOT_FOUND,
          detail: 'Paciente inexistente ou fora da organização.',
        });

      case 'patient_inactive':
        throw new DomainException({
          ...MedicationErrors.PATIENT_INACTIVE,
          detail: 'Paciente inativo não recebe medicamento novo.',
        });

      default:
        return toMedicationResponse(outcome.medication, outcome.others, ctx);
    }
  }
}
