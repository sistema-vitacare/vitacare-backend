import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { GetPatientEvolutionQueryDto } from '@/modules/Indicator/GetPatientEvolution/getPatientEvolution.dto';
import { Trim } from '@/modules/Organization/dtos/organizationFields';

/** Filtros da Figura 43: periodo (regra do BE-20) e condicao do paciente. */
export class ManagementReportQueryDto extends PickType(
  GetPatientEvolutionQueryDto,
  ['from', 'to'] as const,
) {
  @ApiPropertyOptional({
    maxLength: 100,
    example: 'diabetes',
    description:
      'Trecho da condicao principal ou de uma secundaria do paciente, sem diferenciar maiusculas (acentos contam). Omitido: todos os pacientes.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A condicao nao pode ser vazia.' })
  @MaxLength(100, { message: 'A condicao aceita ate 100 caracteres.' })
  condition?: string;
}

export class ManagementReportPeriodDto {
  @ApiProperty({ format: 'date', example: '2026-10-01' })
  from!: string;

  @ApiProperty({ format: 'date', example: '2026-10-31' })
  to!: string;

  @ApiProperty({ example: 'America/Sao_Paulo' })
  timeZone!: string;
}

export class ManagementReportOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Clinica Exemplo', description: 'Nome fantasia.' })
  name!: string;
}

export class ManagementReportHeaderDto {
  @ApiProperty({ type: ManagementReportPeriodDto })
  period!: ManagementReportPeriodDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'diabetes',
    description: 'Condicao filtrada; `null` = todos os pacientes.',
  })
  condition!: string | null;

  @ApiProperty({
    format: 'date-time',
    description: 'Instante da geracao; nada fica guardado.',
  })
  generatedAt!: string;

  @ApiProperty({ type: ManagementReportOrganizationDto })
  organization!: ManagementReportOrganizationDto;
}

export class ReportPersonRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nome Exemplo' })
  name!: string;
}
