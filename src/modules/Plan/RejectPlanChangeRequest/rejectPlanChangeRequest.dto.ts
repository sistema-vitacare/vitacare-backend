import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { Trim } from '@/modules/Organization/dtos/organizationFields';

export class RejectPlanChangeRequestDto {
  @ApiProperty({ maxLength: 500, description: 'Justificativa da recusa.' })
  @Trim()
  @IsString({ message: 'Informe a justificativa da recusa.' })
  @MinLength(1, { message: 'A justificativa nao pode ser vazia.' })
  @MaxLength(500, { message: 'A justificativa aceita ate 500 caracteres.' })
  decisionNote!: string;
}
