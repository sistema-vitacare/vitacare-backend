import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Trim } from '@/modules/Organization/dtos/organizationFields';

import { PlanTermFieldsDto } from '../dtos/planTermFields.dto';

export class AssignOrganizationPlanDto extends PlanTermFieldsDto {
  @ApiProperty({ format: 'uuid', description: 'Plano ativo do catalogo.' })
  @IsUUID('all', { message: 'Informe o identificador do plano.' })
  planId!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'O motivo nao pode ser vazio.' })
  @MaxLength(500, { message: 'O motivo aceita ate 500 caracteres.' })
  reason?: string | null;
}
