import { ApiProperty, PickType } from '@nestjs/swagger';

import { FollowUpDto } from '@/modules/FollowUp/dtos/followUp.dto';
import {
  EvolutionPeriodDto,
  EvolutionSeriesDto,
  GetPatientEvolutionQueryDto,
} from '@/modules/Indicator/GetPatientEvolution/getPatientEvolution.dto';
import { MedicationDto } from '@/modules/Medication/dtos/medication.dto';
import {
  PATIENT_SEXES,
  PATIENT_STATUSES,
} from '@/modules/Patient/dtos/patient.dto';

import { REPORT_MAX_RECORDS } from '../types/patientReport.types';

/** Periodo do relatorio, com a regra do BE-20 (UC10 passo 1). */
export class PatientReportQueryDto extends PickType(
  GetPatientEvolutionQueryDto,
  ['from', 'to'] as const,
) {}

export class ReportPersonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Profissional Exemplo' })
  name!: string;
}

export class ReportOrganizationDto {
  @ApiProperty({ example: 'Clinica Exemplo' })
  name!: string;
}

/** So a identificacao que serve ao acompanhamento: sem documento, contato nem endereco. */
export class ReportPatientDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Maria Exemplo' })
  name!: string;

  @ApiProperty({ format: 'date', example: '1948-03-12' })
  birthDate!: string;

  @ApiProperty({
    enum: [...PATIENT_SEXES],
    nullable: true,
    type: String,
    example: 'female',
  })
  sex!: string | null;

  @ApiProperty({
    enum: [...PATIENT_STATUSES],
    example: 'active',
    description: 'Situacao cadastral; paciente inativo tambem tem relatorio.',
  })
  status!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Hipertensao arterial',
  })
  mainCondition!: string | null;

  @ApiProperty({ type: [String], example: ['Diabetes tipo 2'] })
  secondaryConditions!: string[];

  @ApiProperty({
    type: ReportPersonDto,
    nullable: true,
    description: 'Profissional responsavel vigente.',
  })
  responsible!: ReportPersonDto | null;
}

export class ReportFormCountDto {
  @ApiProperty({ format: 'uuid' })
  formId!: string;

  @ApiProperty({ example: 'Sinais vitais diarios' })
  formName!: string;

  @ApiProperty({ minimum: 1, example: 12 })
  total!: number;
}

export class ReportAuthorCountDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Cuidador Exemplo' })
  name!: string;

  @ApiProperty({ minimum: 1, example: 12 })
  total!: number;
}

export class ReportRecordsDto {
  @ApiProperty({
    minimum: 0,
    maximum: REPORT_MAX_RECORDS,
    example: 12,
    description: 'Registros validos do periodo; anulados nao entram.',
  })
  total!: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  firstVisitedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastVisitedAt!: string | null;

  @ApiProperty({
    type: [ReportFormCountDto],
    description: 'Registros por formulario, do maior total para o menor.',
  })
  byForm!: ReportFormCountDto[];

  @ApiProperty({
    type: [ReportAuthorCountDto],
    description: 'Registros por autor, do maior total para o menor.',
  })
  byAuthor!: ReportAuthorCountDto[];

  @ApiProperty({
    type: [FollowUpDto],
    description:
      'Registros validos completos, da visita mais antiga para a mais recente.',
  })
  items!: FollowUpDto[];
}

/** O mesmo conteudo do PDF (UC10 passo 5). */
export class PatientReportDto {
  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({ type: ReportPersonDto, description: 'Quem gerou.' })
  generatedBy!: ReportPersonDto;

  @ApiProperty({ type: ReportOrganizationDto })
  organization!: ReportOrganizationDto;

  @ApiProperty({ type: EvolutionPeriodDto })
  period!: EvolutionPeriodDto;

  @ApiProperty({ type: ReportPatientDto })
  patient!: ReportPatientDto;

  @ApiProperty({ type: ReportRecordsDto })
  records!: ReportRecordsDto;

  @ApiProperty({
    type: [EvolutionSeriesDto],
    description:
      'As mesmas series e indicadores de GET /patients/{id}/evolution no periodo, sem filtro.',
  })
  series!: EvolutionSeriesDto[];

  @ApiProperty({
    type: [MedicationDto],
    description: 'Medicamentos ativos no momento da geracao.',
  })
  medications!: MedicationDto[];
}
