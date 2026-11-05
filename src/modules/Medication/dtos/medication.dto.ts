import { ApiProperty } from '@nestjs/swagger';

import { UserRefDto } from '@/modules/FollowUp/dtos/followUp.dto';

import {
  MEDICATION_DOSE_UNITS,
  MEDICATION_ROUTES,
  MEDICATION_STATUSES,
  MEDICATION_TIME_ZONE,
} from '../types/medication.types';

export class MedicationScheduleDto {
  @ApiProperty({ format: 'date', example: '2026-11-05' })
  startDate!: string;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    example: null,
    description: '`null` = uso continuo.',
  })
  endDate!: string | null;

  @ApiProperty({ minimum: 1, maximum: 30, example: 1 })
  intervalDays!: number;

  @ApiProperty({
    type: [String],
    example: ['08:00', '20:00'],
    description: 'HH:mm em ordem crescente, hora local do fuso.',
  })
  times!: string[];

  @ApiProperty({ enum: [MEDICATION_TIME_ZONE], example: MEDICATION_TIME_ZONE })
  timeZone!: string;
}

export class ScheduleConflictDto {
  @ApiProperty({ format: 'uuid' })
  medicationId!: string;

  @ApiProperty({ example: 'Metformina' })
  medicationName!: string;

  @ApiProperty({ example: '20:00', description: 'Horario em comum (HH:mm).' })
  time!: string;
}

export class MedicationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ example: 'Losartana potassica' })
  name!: string;

  @ApiProperty({ example: 50, description: 'Ate 3 casas decimais.' })
  doseAmount!: number;

  @ApiProperty({ enum: [...MEDICATION_DOSE_UNITS], example: 'mg' })
  doseUnit!: string;

  @ApiProperty({
    enum: [...MEDICATION_ROUTES],
    nullable: true,
    example: 'oral',
  })
  route!: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  notes!: string | null;

  @ApiProperty({ type: MedicationScheduleDto })
  schedule!: MedicationScheduleDto;

  @ApiProperty({ example: true })
  remindersEnabled!: boolean;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    example: '2026-11-05T23:00:00.000Z',
    description:
      'Proximo horario da agenda vigente, em UTC; `null` se inativo ou sem horario futuro. Independe de `remindersEnabled`.',
  })
  nextScheduledAt!: string | null;

  @ApiProperty({
    type: [ScheduleConflictDto],
    description:
      'Aviso de sobreposicao (UC08): outros medicamentos ativos do paciente no mesmo horario em algum dia comum, de hoje em diante. Nao bloqueia; vazio se inativo.',
  })
  scheduleConflicts!: ScheduleConflictDto[];

  @ApiProperty({ enum: [...MEDICATION_STATUSES], example: 'active' })
  status!: string;

  @ApiProperty({ type: UserRefDto, description: 'Quem cadastrou.' })
  createdBy!: UserRefDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    example: null,
  })
  deactivatedAt!: string | null;
}
