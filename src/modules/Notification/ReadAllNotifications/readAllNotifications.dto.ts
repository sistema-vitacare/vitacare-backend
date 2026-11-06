import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { LowerTrim } from '@/modules/User/dtos/userFields';

export class ReadAllNotificationsDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'So as deste paciente; ausente = todas.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId?: string;
}
