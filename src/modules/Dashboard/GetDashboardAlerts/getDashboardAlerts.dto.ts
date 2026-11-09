import { ApiProperty } from '@nestjs/swagger';

import {
  DashboardDateRangeDto,
  DashboardDayCountDto,
  DashboardPeriodDto,
  DashboardSeverityCountsDto,
  DashboardSourceCountsDto,
} from '../dtos/dashboard.dto';

export class DashboardPendingAlertsDto {
  @ApiProperty({
    minimum: 0,
    example: 7,
    description: 'Alertas com status open agora.',
  })
  total!: number;

  @ApiProperty({ type: DashboardSeverityCountsDto })
  bySeverity!: DashboardSeverityCountsDto;
}

/** Detalhe do indicador de alertas (UC05 passo 4): emitidos no periodo e pendentes agora. */
export class DashboardAlertsDto {
  @ApiProperty({ type: DashboardPeriodDto })
  period!: DashboardPeriodDto;

  @ApiProperty({ type: DashboardDateRangeDto })
  previousPeriod!: DashboardDateRangeDto;

  @ApiProperty({
    minimum: 0,
    example: 41,
    description:
      'Alertas gerados no periodo, de todas as origens e em qualquer status.',
  })
  issuedInPeriod!: number;

  @ApiProperty({ minimum: 0, example: 38 })
  previousPeriodTotal!: number;

  @ApiProperty({
    example: 3,
    description: 'issuedInPeriod - previousPeriodTotal.',
  })
  change!: number;

  @ApiProperty({
    type: [DashboardDayCountDto],
    description: 'Emitidos por dia da geracao; todo dia do periodo aparece.',
  })
  byDay!: DashboardDayCountDto[];

  @ApiProperty({
    type: DashboardSeverityCountsDto,
    description: 'Emitidos no periodo por severidade.',
  })
  bySeverity!: DashboardSeverityCountsDto;

  @ApiProperty({
    type: DashboardSourceCountsDto,
    description: 'Emitidos no periodo por origem.',
  })
  bySource!: DashboardSourceCountsDto;

  @ApiProperty({
    minimum: 0,
    example: 5,
    description: 'Dos emitidos no periodo, quantos seguem abertos.',
  })
  issuedStillOpen!: number;

  @ApiProperty({
    type: DashboardPendingAlertsDto,
    description: 'Todos os abertos agora, independentemente do periodo.',
  })
  pending!: DashboardPendingAlertsDto;
}
