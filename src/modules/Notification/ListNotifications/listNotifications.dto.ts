import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { LowerTrim } from '@/modules/User/dtos/userFields';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'true = so nao lidas; false = so lidas; ausente = todas.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'unread deve ser true ou false.' })
  unread?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'So deste paciente.' })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId?: string;
}
