import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { Trim } from '@/modules/Organization/dtos/organizationFields';

import { PATIENT_STATUSES } from '../dtos/patient.dto';
import type { PatientStatus } from '../types/patient.types';

export class ListPatientsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: [...PATIENT_STATUSES],
    default: 'active',
    description:
      'A listagem principal mostra so ativos; `inactive` lista os inativados.',
  })
  @IsOptional()
  @IsIn(PATIENT_STATUSES, { message: 'O status deve ser active ou inactive.' })
  status: PatientStatus = 'active';

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Trecho do nome, sem diferenciar maiusculas, ou trecho do CPF (so digitos e pontuacao).',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A busca nao pode ser vazia.' })
  @MaxLength(100, { message: 'A busca aceita ate 100 caracteres.' })
  search?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Trecho da condicao principal ou de uma secundaria.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A condicao nao pode ser vazia.' })
  @MaxLength(100, { message: 'A condicao aceita ate 100 caracteres.' })
  condition?: string;
}
