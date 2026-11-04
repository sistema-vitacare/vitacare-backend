import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import type { PatientLinkRole } from '@/modules/Patient/types/patient.types';

import {
  PATIENT_LINK_ROLES,
  PATIENT_LINK_STATUSES,
} from '../dtos/patientLink.dto';
import type { PatientLinkStatus } from '../types/patientAccess.types';

export class ListPatientLinksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculos do paciente.' })
  @IsOptional()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculos do usuario.' })
  @IsOptional()
  @IsUUID('all', { message: 'Informe o identificador do usuario.' })
  userId?: string;

  @ApiPropertyOptional({ enum: [...PATIENT_LINK_ROLES] })
  @IsOptional()
  @IsIn(PATIENT_LINK_ROLES, {
    message: 'O papel deve ser responsible_professional, caregiver ou family.',
  })
  role?: PatientLinkRole;

  @ApiPropertyOptional({
    enum: [...PATIENT_LINK_STATUSES],
    default: 'active',
    description: '`revoked` lista o historico de vinculos revogados.',
  })
  @IsOptional()
  @IsIn(PATIENT_LINK_STATUSES, {
    message: 'O status deve ser active ou revoked.',
  })
  status: PatientLinkStatus = 'active';
}
