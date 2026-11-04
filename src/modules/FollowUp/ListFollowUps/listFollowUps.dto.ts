import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';

import {
  FOLLOW_UP_STATUSES,
  type FollowUpStatus,
} from '../types/followUp.types';

export class ListFollowUpsQueryDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Paciente dos registros.' })
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId!: string;

  @ApiPropertyOptional({
    enum: [...FOLLOW_UP_STATUSES],
    description: 'Omitido lista validos e anulados.',
  })
  @IsOptional()
  @IsIn(FOLLOW_UP_STATUSES, { message: 'O status deve ser valid ou annulled.' })
  status?: FollowUpStatus;
}
