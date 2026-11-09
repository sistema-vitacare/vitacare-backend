import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { IsCalendarDate } from '@/common/validation/isCalendarDate.decorator';
import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  EVOLUTION_MAX_DAYS,
  MINIMUM_SAMPLES,
  TREND_DIRECTIONS,
  type TrendDirection,
  UNAVAILABLE_REASONS,
  type UnavailableReason,
} from '../types/evolution.types';

/** Periodo e recorte da evolucao (UC10 passos 1-4, UC14 passo 3). */
export class GetPatientEvolutionQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    example: '2026-10-01',
    description:
      'Primeiro dia, inclusivo, pela data da visita no fuso America/Sao_Paulo. Omitido: 29 dias antes de to.',
  })
  @IsOptional()
  @IsCalendarDate(
    {},
    { message: 'Informe a data inicial no formato AAAA-MM-DD.' },
  )
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-10-31',
    description: `Ultimo dia, inclusivo, no mesmo fuso. Omitido: hoje. Nao anterior a from; periodo de no maximo ${EVOLUTION_MAX_DAYS} dias.`,
  })
  @IsOptional()
  @IsCalendarDate(
    { notBefore: 'from' },
    {
      message:
        'Informe a data final no formato AAAA-MM-DD, igual ou posterior a inicial.',
    },
  )
  to?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'So series deste formulario.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do formulario.' })
  formId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'So series deste parametro (fieldKey, identidade do campo atraves das versoes).',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do parametro.' })
  fieldKey?: string;
}

export class EvolutionPeriodDto {
  @ApiProperty({ format: 'date', example: '2026-10-01' })
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-10-31' })
  to!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  timeZone!: string;
}

export class EvolutionFormRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sinais vitais diarios' })
  name!: string;
}

export class EvolutionPointDto {
  @ApiProperty({
    example: 105,
    description: 'Valor registrado, sem arredondamento nem classificacao.',
  })
  value!: number;

  @ApiProperty({ format: 'date-time', description: 'Data e hora da visita.' })
  visitedAt!: string;

  @ApiProperty({ format: 'uuid', description: 'Registro de origem do valor.' })
  followUpId!: string;
}

export class EvolutionTrendDto {
  @ApiProperty({
    example: 2.056,
    description:
      'Inclinacao da reta de minimos quadrados, na unidade do campo por dia corrido, com 3 casas.',
  })
  slopePerDay!: number;

  @ApiProperty({
    enum: [...TREND_DIRECTIONS],
    example: 'rising',
    description:
      'Sinal da inclinacao arredondada; flat so quando ela e 0. Sem leitura clinica.',
  })
  direction!: TrendDirection;
}

export class UnavailableIndicatorDto {
  @ApiProperty({ enum: Object.keys(MINIMUM_SAMPLES), example: 'trend' })
  indicator!: string;

  @ApiProperty({
    enum: [...UNAVAILABLE_REASONS],
    example: 'INSUFFICIENT_SAMPLES',
    description:
      'INSUFFICIENT_SAMPLES: menos medicoes que o minimo; INSUFFICIENT_TIME_SPAN: todas no mesmo instante.',
  })
  reason!: UnavailableReason;

  @ApiProperty({
    example: 3,
    description: 'Minimo do indicador: media 1, variacao 2, tendencia 3.',
  })
  minimumSamples!: number;
}

export class EvolutionIndicatorsDto {
  @ApiProperty({ minimum: 1, example: 3, description: 'Medicoes da serie.' })
  sampleSize!: number;

  @ApiProperty({ example: 98 })
  min!: number;

  @ApiProperty({ example: 142 })
  max!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 115,
    description: 'Media aritmetica simples, com 3 casas.',
  })
  mean!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 37,
    description:
      'Ultimo valor menos o primeiro, com 3 casas; null com menos de 2 medicoes.',
  })
  variation!: number | null;

  @ApiProperty({
    type: EvolutionTrendDto,
    nullable: true,
    description: 'null com menos de 3 medicoes ou com todas no mesmo instante.',
  })
  trend!: EvolutionTrendDto | null;

  @ApiProperty({
    type: [UnavailableIndicatorDto],
    description: 'Indicadores que nao puderam ser calculados e por que.',
  })
  unavailable!: UnavailableIndicatorDto[];
}

export class EvolutionSeriesDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Identidade do campo atraves das versoes; repete-se quando a unidade ou a faixa mudou.',
  })
  fieldKey!: string;

  @ApiProperty({
    example: 'Glicemia capilar',
    description: 'Nome na versao do valor mais recente da serie.',
  })
  name!: string;

  @ApiProperty({ enum: ['number', 'scale'], example: 'number' })
  fieldType!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'mg/dL',
    description: 'Unidade comum a todos os pontos (campo number).',
  })
  unit!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description: 'Minimo da escala comum a todos os pontos (campo scale).',
  })
  scaleMin!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description: 'Maximo da escala comum a todos os pontos (campo scale).',
  })
  scaleMax!: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Sinais vitais' })
  section!: string | null;

  @ApiProperty({ type: EvolutionFormRefDto })
  form!: EvolutionFormRefDto;

  @ApiProperty({
    type: [EvolutionPointDto],
    description:
      'Medicoes do periodo, da visita mais antiga para a mais recente.',
  })
  points!: EvolutionPointDto[];

  @ApiProperty({ type: EvolutionIndicatorsDto })
  indicators!: EvolutionIndicatorsDto;
}

export class PatientEvolutionDto {
  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ type: EvolutionPeriodDto })
  period!: EvolutionPeriodDto;

  @ApiProperty({
    type: [EvolutionSeriesDto],
    description:
      'Uma serie por campo number/scale com medicao valida no periodo e configuracao compativel; vazia sem dados.',
  })
  series!: EvolutionSeriesDto[];
}
