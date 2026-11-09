import { ApiProperty, PickType } from '@nestjs/swagger';

import { GetPatientEvolutionQueryDto } from '@/modules/Indicator/GetPatientEvolution/getPatientEvolution.dto';

/** Periodo do painel, com a regra do BE-20 (UC05 passo 3). */
export class DashboardPeriodQueryDto extends PickType(
  GetPatientEvolutionQueryDto,
  ['from', 'to'] as const,
) {}

export class DashboardDateRangeDto {
  @ApiProperty({ format: 'date', example: '2026-09-01' })
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-09-30' })
  to!: string;
}

export class DashboardPeriodDto extends DashboardDateRangeDto {
  @ApiProperty({ example: 'America/Sao_Paulo' })
  timeZone!: string;
}

export class DashboardRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nome Exemplo' })
  name!: string;
}

export class DashboardDayCountDto {
  @ApiProperty({ format: 'date', example: '2026-10-01' })
  date!: string;

  @ApiProperty({ minimum: 0, example: 11 })
  total!: number;
}

export class DashboardSeverityCountsDto {
  @ApiProperty({ minimum: 0, example: 2 })
  critical!: number;

  @ApiProperty({ minimum: 0, example: 4 })
  warning!: number;

  @ApiProperty({ minimum: 0, example: 1 })
  info!: number;
}

export class DashboardSourceCountsDto {
  @ApiProperty({
    minimum: 0,
    example: 5,
    description: 'Valor registrado fora da regra.',
  })
  reading!: number;

  @ApiProperty({ minimum: 0, example: 1, description: 'Ausencia de registro.' })
  absence!: number;

  @ApiProperty({
    minimum: 0,
    example: 1,
    description: 'Lembrete de medicamento.',
  })
  medication_reminder!: number;
}
