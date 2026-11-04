import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { Trim } from '@/modules/Organization/dtos/organizationFields';
import type { PatientLinkRole } from '@/modules/Patient/types/patient.types';

import { PATIENT_LINK_ROLES } from '../dtos/patientLink.dto';

export class ListEligibleUsersQueryDto extends PaginationQueryDto {
  @ApiProperty({
    enum: [...PATIENT_LINK_ROLES],
    description:
      '`responsible_professional` lista profissionais e administradores; `caregiver` e `family`, os usuarios desse perfil.',
  })
  @IsIn(PATIENT_LINK_ROLES, {
    message: 'O papel deve ser responsible_professional, caregiver ou family.',
  })
  role!: PatientLinkRole;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Trecho do nome, sem diferenciar maiusculas.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A busca nao pode ser vazia.' })
  @MaxLength(100, { message: 'A busca aceita ate 100 caracteres.' })
  search?: string;
}
