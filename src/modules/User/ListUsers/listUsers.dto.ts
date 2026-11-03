import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import {
  TENANT_PROFILE_CODES,
  type TenantProfileCode,
} from '@/modules/Access/access.permissions';
import { Trim } from '@/modules/Organization/dtos/organizationFields';

import { USER_STATUSES } from '../dtos/user.dto';
import type { UserStatus } from '../types/user.types';

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: [...USER_STATUSES] })
  @IsOptional()
  @IsIn(USER_STATUSES, {
    message: 'O status deve ser pending, active ou inactive.',
  })
  status?: UserStatus;

  @ApiPropertyOptional({ enum: [...TENANT_PROFILE_CODES] })
  @IsOptional()
  @IsIn(TENANT_PROFILE_CODES, {
    message: 'O perfil deve ser admin, professional, caregiver ou family.',
  })
  profileCode?: TenantProfileCode;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Trecho do nome ou do e-mail, sem diferenciar maiusculas.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A busca nao pode ser vazia.' })
  @MaxLength(100, { message: 'A busca aceita ate 100 caracteres.' })
  search?: string;
}
