import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Trim } from '@/modules/Organization/dtos/organizationFields';

export class CreatePlanChangeRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Plano ativo do catalogo.' })
  @IsUUID('all', { message: 'Informe o identificador do plano solicitado.' })
  requestedPlanId!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A observacao nao pode ser vazia.' })
  @MaxLength(500, { message: 'A observacao aceita ate 500 caracteres.' })
  notes?: string | null;
}
