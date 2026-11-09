import { ApiProperty } from '@nestjs/swagger';

import {
  ALERT_RULE_OPERATORS,
  ALERT_SEVERITIES,
  ALERT_SOURCES,
} from '@/modules/Alert/types/alert.types';

import {
  DashboardDateRangeDto,
  DashboardDayCountDto,
  DashboardPeriodDto,
  DashboardRefDto,
} from '../dtos/dashboard.dto';

export class DashboardPatientsSummaryDto {
  @ApiProperty({
    minimum: 0,
    example: 128,
    description: 'Pacientes ativos agora.',
  })
  active!: number;

  @ApiProperty({
    minimum: 0,
    example: 12,
    description:
      'Pacientes cadastrados no periodo, em qualquer situacao atual (variacao da Figura 33).',
  })
  newInPeriod!: number;
}

export class DashboardUsersSummaryDto {
  @ApiProperty({
    minimum: 0,
    example: 23,
    description:
      'Usuarios com status active agora (ja fizeram o primeiro acesso); convidados pending nao contam.',
  })
  active!: number;
}

export class DashboardFollowUpsSummaryDto {
  @ApiProperty({
    minimum: 0,
    example: 340,
    description:
      'Registros validos com visita no periodo (anulados nao contam).',
  })
  inPeriod!: number;

  @ApiProperty({
    minimum: 0,
    example: 335,
    description: 'Mesma contagem no periodo anterior.',
  })
  previousPeriodTotal!: number;

  @ApiProperty({
    example: 5,
    description: 'inPeriod - previousPeriodTotal; pode ser negativo.',
  })
  change!: number;

  @ApiProperty({
    type: [DashboardDayCountDto],
    description:
      'Registros validos por dia da visita; todo dia do periodo aparece, com zero onde nao houve.',
  })
  byDay!: DashboardDayCountDto[];
}

export class DashboardAlertsSummaryDto {
  @ApiProperty({
    minimum: 0,
    example: 41,
    description:
      'Alertas gerados no periodo, de todas as origens e em qualquer status.',
  })
  issuedInPeriod!: number;

  @ApiProperty({
    minimum: 0,
    example: 38,
    description: 'Mesma contagem no periodo anterior.',
  })
  previousPeriodTotal!: number;

  @ApiProperty({
    example: 3,
    description: 'issuedInPeriod - previousPeriodTotal; pode ser negativo.',
  })
  change!: number;

  @ApiProperty({
    minimum: 0,
    example: 7,
    description: 'Alertas com status open agora, independentemente do periodo.',
  })
  pending!: number;
}

export class DashboardPriorityAlertReadingDto {
  @ApiProperty({ example: 'Saturacao de oxigenio' })
  fieldName!: string;

  @ApiProperty({ type: String, nullable: true, example: '%' })
  fieldUnit!: string | null;

  @ApiProperty({
    example: '91',
    description: 'Valor registrado, como gravado.',
  })
  value!: string;

  @ApiProperty({ enum: [...ALERT_RULE_OPERATORS], example: 'lt' })
  operator!: string;

  @ApiProperty({ example: 94, description: 'Valor de referencia da regra.' })
  referenceValue!: number;

  @ApiProperty({
    type: DashboardRefDto,
    description: 'Autor do registro que disparou o alerta (o cuidador).',
  })
  author!: DashboardRefDto;
}

export class DashboardPriorityAlertDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: DashboardRefDto })
  patient!: DashboardRefDto;

  @ApiProperty({ enum: [...ALERT_SOURCES], example: 'reading' })
  source!: string;

  @ApiProperty({ enum: [...ALERT_SEVERITIES], example: 'critical' })
  severity!: string;

  @ApiProperty({ example: 'Saturacao abaixo da referencia' })
  title!: string;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({
    type: DashboardPriorityAlertReadingDto,
    nullable: true,
    description: 'So para source = reading; null nas demais origens.',
  })
  reading!: DashboardPriorityAlertReadingDto | null;
}

export class DashboardLatestFollowUpDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: DashboardRefDto })
  patient!: DashboardRefDto;

  @ApiProperty({ type: DashboardRefDto })
  form!: DashboardRefDto;

  @ApiProperty({ type: DashboardRefDto, description: 'Quem registrou.' })
  author!: DashboardRefDto;

  @ApiProperty({ format: 'date-time', description: 'Data e hora da visita.' })
  visitedAt!: string;
}

/** Resumo do painel operacional (UC05 passos 1-3, Figura 33). */
export class DashboardDto {
  @ApiProperty({ type: DashboardPeriodDto })
  period!: DashboardPeriodDto;

  @ApiProperty({
    type: DashboardDateRangeDto,
    description: 'Os mesmos n dias imediatamente antes de period.from.',
  })
  previousPeriod!: DashboardDateRangeDto;

  @ApiProperty({ type: DashboardPatientsSummaryDto })
  patients!: DashboardPatientsSummaryDto;

  @ApiProperty({ type: DashboardUsersSummaryDto })
  users!: DashboardUsersSummaryDto;

  @ApiProperty({ type: DashboardFollowUpsSummaryDto })
  followUps!: DashboardFollowUpsSummaryDto;

  @ApiProperty({ type: DashboardAlertsSummaryDto })
  alerts!: DashboardAlertsSummaryDto;

  @ApiProperty({
    type: [DashboardPriorityAlertDto],
    description:
      'Ate 5 alertas abertos: critical, depois warning, depois info; em cada severidade, os mais recentes.',
  })
  priorityAlerts!: DashboardPriorityAlertDto[];

  @ApiProperty({
    type: [DashboardLatestFollowUpDto],
    description:
      'Ate 5 registros validos do periodo, da visita mais recente para a mais antiga, sem as respostas.',
  })
  latestFollowUps!: DashboardLatestFollowUpDto[];
}
