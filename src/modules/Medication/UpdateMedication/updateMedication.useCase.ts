import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { patientScope } from '@/modules/Patient/policies/patient.policy';

import type { MedicationDto } from '../dtos/medication.dto';
import { MedicationErrors } from '../medication.errors';
import {
  toMedicationPatch,
  toMedicationResponse,
} from '../parsers/medication.parser';
import { MedicationRepository } from '../repositories/medication.repository';
import type { UpdateMedicationOutcome } from '../types/medication.types';
import type { UpdateMedicationDto } from './updateMedication.dto';

const FAILURES: Record<
  Exclude<UpdateMedicationOutcome['kind'], 'updated'>,
  () => DomainException
> = {
  not_found: () =>
    new DomainException({
      ...MedicationErrors.NOT_FOUND,
      detail: 'Medicamento inexistente ou fora da organização.',
    }),
  inactive: () =>
    new DomainException({
      ...MedicationErrors.INACTIVE,
      detail: 'Medicamento inativo não é editável.',
    }),
  patient_inactive: () =>
    new DomainException({
      ...MedicationErrors.PATIENT_INACTIVE,
      detail: 'Medicamento de paciente inativo não é editável.',
    }),
  invalid_period: () =>
    new DomainException({
      ...MedicationErrors.INVALID_PERIOD,
      detail: 'endDate resultante anterior ao startDate resultante.',
      fields: [{ field: 'endDate', code: 'BEFORE_START' }],
    }),
  unchanged: () =>
    new DomainException({
      ...MedicationErrors.NOTHING_TO_UPDATE,
      detail: 'Os valores enviados são iguais aos gravados.',
    }),
};

/**
 * Edicao do UC08. Mudar inicio, fim, intervalo, horarios ou lembretes encerra
 * a agenda vigente e programa a nova: o horario antigo deixa de valer.
 */
@Injectable()
export class UpdateMedicationUseCase {
  constructor(private readonly medications: MedicationRepository) {}

  async execute(
    medicationId: string,
    dto: UpdateMedicationDto,
    ctx: RequestContext,
  ): Promise<MedicationDto> {
    const patch = toMedicationPatch(dto);

    if (
      Object.keys(patch.fields).length === 0 &&
      Object.keys(patch.schedule).length === 0
    ) {
      throw new DomainException({
        ...MedicationErrors.NOTHING_TO_UPDATE,
        detail: 'Corpo sem nenhum campo editável.',
      });
    }

    const outcome = await this.medications.update({
      ...patientScope(ctx),
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      medicationId,
      ...patch,
    });

    if (outcome.kind !== 'updated') throw FAILURES[outcome.kind]();

    return toMedicationResponse(outcome.medication, outcome.others, ctx);
  }
}
