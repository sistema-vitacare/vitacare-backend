import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  DoseAmountField,
  DoseUnitField,
  EndDateField,
  IntervalDaysField,
  NameField,
  NotesField,
  RemindersEnabledField,
  RouteField,
  StartDateField,
  TimesField,
} from '../dtos/medicationFields';
import type {
  MedicationDoseUnit,
  MedicationRoute,
} from '../types/medication.types';

/** UC08 passo 2: obrigatorios nome, dose (quantidade e unidade) e horarios. */
export class CreateMedicationDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Paciente ativo da organizacao.',
  })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId!: string;

  @NameField('required')
  name!: string;

  @DoseAmountField('required')
  doseAmount!: number;

  @DoseUnitField('required')
  doseUnit!: MedicationDoseUnit;

  @RouteField()
  route?: MedicationRoute | null;

  @NotesField()
  notes?: string | null;

  @StartDateField('optional')
  startDate?: string | null;

  @EndDateField(true)
  endDate?: string | null;

  @IntervalDaysField('optional')
  intervalDays?: number | null;

  @TimesField('required')
  times!: string[];

  @RemindersEnabledField('optional')
  remindersEnabled?: boolean | null;
}
