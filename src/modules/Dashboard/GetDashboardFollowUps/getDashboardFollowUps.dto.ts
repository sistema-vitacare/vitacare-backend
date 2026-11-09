import { ApiProperty } from '@nestjs/swagger';

import {
  DashboardDateRangeDto,
  DashboardDayCountDto,
  DashboardPeriodDto,
  DashboardRefDto,
} from '../dtos/dashboard.dto';

export class DashboardFollowUpsByFormDto {
  @ApiProperty({ type: DashboardRefDto })
  form!: DashboardRefDto;

  @ApiProperty({ minimum: 1, example: 210 })
  total!: number;
}

export class DashboardFollowUpsByAuthorDto {
  @ApiProperty({
    type: DashboardRefDto,
    description: 'Quem registrou (o cuidador).',
  })
  user!: DashboardRefDto;

  @ApiProperty({ minimum: 1, example: 95 })
  total!: number;
}

/** Detalhe do indicador de registros (UC05 passo 4). */
export class DashboardFollowUpsDto {
  @ApiProperty({ type: DashboardPeriodDto })
  period!: DashboardPeriodDto;

  @ApiProperty({ type: DashboardDateRangeDto })
  previousPeriod!: DashboardDateRangeDto;

  @ApiProperty({
    minimum: 0,
    example: 340,
    description: 'Registros validos com visita no periodo.',
  })
  inPeriod!: number;

  @ApiProperty({ minimum: 0, example: 335 })
  previousPeriodTotal!: number;

  @ApiProperty({ example: 5, description: 'inPeriod - previousPeriodTotal.' })
  change!: number;

  @ApiProperty({
    type: [DashboardDayCountDto],
    description: 'Todo dia do periodo, com zero onde nao houve.',
  })
  byDay!: DashboardDayCountDto[];

  @ApiProperty({
    type: [DashboardFollowUpsByFormDto],
    description: 'Do maior para o menor.',
  })
  byForm!: DashboardFollowUpsByFormDto[];

  @ApiProperty({
    type: [DashboardFollowUpsByAuthorDto],
    description: 'Do maior para o menor.',
  })
  byAuthor!: DashboardFollowUpsByAuthorDto[];
}
