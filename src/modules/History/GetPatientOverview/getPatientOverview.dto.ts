import { ApiProperty } from '@nestjs/swagger';

import { AlertDto } from '@/modules/Alert/dtos/alert.dto';
import { MedicationDto } from '@/modules/Medication/dtos/medication.dto';

export class PatientOverviewCountsDto {
  @ApiProperty({
    minimum: 0,
    example: 12,
    description: 'Registros de acompanhamento validos (anulados nao contam).',
  })
  validFollowUps!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    example: 1,
    description: 'Alertas em aberto; null sem alerts:read.',
  })
  openAlerts!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    example: 3,
    description: 'Medicamentos ativos; null sem medications:read.',
  })
  activeMedications!: number | null;
}

export class MeasurementFormRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sinais vitais diarios' })
  name!: string;
}

export class MeasurementValueDto {
  @ApiProperty({
    example: 98,
    description: 'Valor registrado, sem classificacao clinica.',
  })
  value!: number;

  @ApiProperty({ format: 'date-time', description: 'Data e hora da visita.' })
  visitedAt!: string;

  @ApiProperty({ format: 'uuid', description: 'Registro de origem do valor.' })
  followUpId!: string;
}

export class PatientMeasurementDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Identidade do campo atraves das versoes do formulario.',
  })
  fieldKey!: string;

  @ApiProperty({
    example: 'Glicemia capilar',
    description: 'Nome na versao do valor mais recente.',
  })
  name!: string;

  @ApiProperty({ enum: ['number', 'scale'], example: 'number' })
  fieldType!: string;

  @ApiProperty({ type: String, nullable: true, example: 'mg/dL' })
  unit!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Sinais vitais' })
  section!: string | null;

  @ApiProperty({ type: MeasurementFormRefDto })
  form!: MeasurementFormRefDto;

  @ApiProperty({
    type: [MeasurementValueDto],
    description: 'Ate 5 valores, da visita mais recente para a mais antiga.',
  })
  values!: MeasurementValueDto[];
}

export class PatientOverviewDto {
  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ type: PatientOverviewCountsDto })
  counts!: PatientOverviewCountsDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Visita do registro valido mais recente; null sem registro.',
  })
  lastVisitedAt!: string | null;

  @ApiProperty({
    type: [PatientMeasurementDto],
    description:
      'Ultimas medicoes de cada campo number/scale ja respondido em registro valido, por formulario e ordem do campo.',
  })
  measurements!: PatientMeasurementDto[];

  @ApiProperty({
    type: [MedicationDto],
    nullable: true,
    description:
      'Ate 10 medicamentos ativos, em ordem alfabetica, no formato de GET /medications; null sem medications:read.',
  })
  activeMedications!: MedicationDto[] | null;

  @ApiProperty({
    type: [AlertDto],
    nullable: true,
    description:
      'Os 5 alertas mais recentes, abertos ou resolvidos, no formato de GET /alerts; null sem alerts:read.',
  })
  recentAlerts!: AlertDto[] | null;
}
