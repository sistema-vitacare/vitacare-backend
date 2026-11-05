import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  MEDICATION_STATUSES,
  type MedicationStatus,
} from '../types/medication.types';

export class ListMedicationsQueryDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Paciente dos medicamentos.' })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId!: string;

  @ApiPropertyOptional({
    enum: [...MEDICATION_STATUSES],
    description: 'Omitido lista ativos e inativos (ativos primeiro).',
  })
  @IsOptional()
  @IsIn(MEDICATION_STATUSES, {
    message: 'O status deve ser active ou inactive.',
  })
  status?: MedicationStatus;
}
