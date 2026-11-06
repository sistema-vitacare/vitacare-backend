import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  type AlertSeverity,
  type AlertStatus,
} from '../types/alert.types';

export class ListAlertsQueryDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Paciente dos alertas.' })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId!: string;

  @ApiPropertyOptional({ enum: [...ALERT_SEVERITIES] })
  @IsOptional()
  @IsIn(ALERT_SEVERITIES, {
    message: 'A severidade deve ser critical, warning ou info.',
  })
  severity?: AlertSeverity;

  @ApiPropertyOptional({
    enum: [...ALERT_STATUSES],
    description: 'open = em aberto; resolved = resolvidos.',
  })
  @IsOptional()
  @IsIn(ALERT_STATUSES, { message: 'O status deve ser open ou resolved.' })
  status?: AlertStatus;
}
