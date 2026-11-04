import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { PatientText } from '@/modules/Patient/dtos/patientFields';

import { FORM_STATUSES, type FormStatus } from '../types/form.types';

export class ListFormsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: [...FORM_STATUSES],
    description:
      'Omitido lista todos para quem configura; o cuidador so recebe ativos.',
  })
  @IsOptional()
  @IsIn(FORM_STATUSES, {
    message: 'O status deve ser draft, active ou inactive.',
  })
  status?: FormStatus;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Trecho do nome; `%` e `_` sao literais.',
  })
  @IsOptional()
  @PatientText('A busca', 100)
  search?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'So formularios ativos que valem para este paciente.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId?: string;
}
