import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { Trim } from '@/modules/Organization/dtos/organizationFields';

import { PlanTermFieldsDto } from '../dtos/planTermFields.dto';

export class ApprovePlanChangeRequestDto extends PlanTermFieldsDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A justificativa nao pode ser vazia.' })
  @MaxLength(500, { message: 'A justificativa aceita ate 500 caracteres.' })
  decisionNote?: string | null;
}
