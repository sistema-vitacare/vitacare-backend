import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';

import { Trim } from '../dtos/organizationFields';

export class ListOrganizationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'], {
    message: 'O status deve ser active ou inactive.',
  })
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Trecho do nome fantasia, da razao social ou do codigo.',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A busca nao pode ser vazia.' })
  @MaxLength(100, { message: 'A busca aceita ate 100 caracteres.' })
  search?: string;
}
