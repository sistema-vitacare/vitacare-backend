import { ApiProperty } from '@nestjs/swagger';

import {
  ALERT_SOURCES,
  ALERT_STATUSES,
} from '@/modules/Alert/types/alert.types';
import { PATIENT_STATUSES } from '@/modules/Patient/dtos/patient.dto';

import {
  ManagementReportHeaderDto,
  ReportPersonRefDto,
} from '../dtos/managementReport.dto';

export class AlertStatusCountsDto {
  @ApiProperty({ minimum: 0, example: 12, description: 'Emitidos no periodo.' })
  total!: number;

  @ApiProperty({ minimum: 0, example: 3, description: 'Ainda abertos agora.' })
  open!: number;

  @ApiProperty({ minimum: 0, example: 9, description: 'Ja resolvidos agora.' })
  resolved!: number;
}

export class AlertTotalsDto {
  @ApiProperty({ minimum: 0, example: 20 })
  issued!: number;

  @ApiProperty({ minimum: 0, example: 5 })
  open!: number;

  @ApiProperty({ minimum: 0, example: 15 })
  resolved!: number;

  @ApiProperty({
    minimum: 0,
    example: 4,
    description:
      'Intercorrencias = alertas `critical` emitidos (decisao de 2026-11-12).',
  })
  intercurrences!: number;
}

export class AlertsBySourceDto {
  @ApiProperty({
    type: AlertStatusCountsDto,
    description: 'Valor fora da regra.',
  })
  reading!: AlertStatusCountsDto;

  @ApiProperty({
    type: AlertStatusCountsDto,
    description: 'Ausencia de registro.',
  })
  absence!: AlertStatusCountsDto;

  @ApiProperty({
    type: AlertStatusCountsDto,
    description: 'Lembrete de medicamento.',
  })
  medicationReminder!: AlertStatusCountsDto;
}

export class AlertsBySeverityDto {
  @ApiProperty({ type: AlertStatusCountsDto })
  critical!: AlertStatusCountsDto;

  @ApiProperty({ type: AlertStatusCountsDto })
  warning!: AlertStatusCountsDto;

  @ApiProperty({ type: AlertStatusCountsDto })
  info!: AlertStatusCountsDto;
}

export class ResolutionTimeDto {
  @ApiProperty({
    minimum: 0,
    example: 9,
    description: 'Alertas emitidos no periodo que ja foram resolvidos.',
  })
  resolved!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 5.25,
    description:
      'Media de horas entre a emissao e a resolucao, 3 casas; `null` sem resolvido.',
  })
  averageHours!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2.5,
    description: 'Mediana das mesmas horas; `null` sem resolvido.',
  })
  medianHours!: number | null;
}

export class ResolutionBySeverityDto {
  @ApiProperty({ type: ResolutionTimeDto })
  critical!: ResolutionTimeDto;

  @ApiProperty({ type: ResolutionTimeDto })
  warning!: ResolutionTimeDto;

  @ApiProperty({ type: ResolutionTimeDto })
  info!: ResolutionTimeDto;
}

export class AlertResolutionDto {
  @ApiProperty({ type: ResolutionTimeDto })
  overall!: ResolutionTimeDto;

  @ApiProperty({ type: ResolutionBySeverityDto })
  bySeverity!: ResolutionBySeverityDto;
}

export class ReportPatientRefDto extends ReportPersonRefDto {
  @ApiProperty({ enum: PATIENT_STATUSES, example: 'active' })
  status!: string;
}

export class TopAlertPatientDto {
  @ApiProperty({ type: ReportPatientRefDto })
  patient!: ReportPatientRefDto;

  @ApiProperty({ minimum: 1, example: 6 })
  total!: number;

  @ApiProperty({ minimum: 0, example: 2 })
  intercurrences!: number;

  @ApiProperty({ minimum: 0, example: 1 })
  open!: number;
}

export class AlertDayDto {
  @ApiProperty({ format: 'date', example: '2026-10-01' })
  date!: string;

  @ApiProperty({ minimum: 0, example: 3 })
  total!: number;

  @ApiProperty({ minimum: 0, example: 1 })
  intercurrences!: number;
}

export class IntercurrenceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({ enum: ALERT_SOURCES, example: 'reading' })
  source!: string;

  @ApiProperty({ type: ReportPersonRefDto })
  patient!: ReportPersonRefDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Glicemia',
    description:
      'Campo (reading), formulario (absence) ou medicamento (medication_reminder). Nunca o valor medido.',
  })
  subject!: string | null;

  @ApiProperty({ enum: ALERT_STATUSES, example: 'resolved' })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  resolvedAt!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 1.5 })
  hoursToResolve!: number | null;
}

/** Relatorio "Alertas e intercorrencias" (Figura 43, BE-30). */
export class AlertsReportDto extends ManagementReportHeaderDto {
  @ApiProperty({ type: AlertTotalsDto })
  totals!: AlertTotalsDto;

  @ApiProperty({ type: AlertsBySourceDto })
  bySource!: AlertsBySourceDto;

  @ApiProperty({ type: AlertsBySeverityDto })
  bySeverity!: AlertsBySeverityDto;

  @ApiProperty({ type: AlertResolutionDto })
  resolution!: AlertResolutionDto;

  @ApiProperty({
    type: [TopAlertPatientDto],
    description: 'Ate 10 pacientes: total desc, intercorrencias desc, nome.',
  })
  topPatients!: TopAlertPatientDto[];

  @ApiProperty({
    type: [AlertDayDto],
    description: 'Todo dia do periodo, com zero onde nada foi emitido.',
  })
  byDay!: AlertDayDto[];

  @ApiProperty({
    type: [IntercurrenceDto],
    description: 'As 200 intercorrencias mais recentes do periodo.',
  })
  intercurrences!: IntercurrenceDto[];

  @ApiProperty({
    example: false,
    description:
      'Ha mais intercorrencias que as 200 listadas (total em `totals.intercurrences`).',
  })
  intercurrencesTruncated!: boolean;
}
