import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  ALERT_SEVERITIES,
  ALERT_SORTS,
  ALERT_SOURCES,
  ALERT_STATUSES,
  type AlertSeverity,
  type AlertSort,
  type AlertSource,
  type AlertStatus,
} from '../types/alert.types';

/** Lista de alertas; sem `patientId`, a organizacao no alcance (BE-33). */
export class ListAlertsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Paciente dos alertas; omitido = todos os pacientes ao alcance da sessao.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId?: string;

  @ApiPropertyOptional({
    enum: [...ALERT_SOURCES],
    description:
      'reading = valor registrado; absence = ausencia de registro; medication_reminder = horario de medicamento.',
  })
  @IsOptional()
  @IsIn(ALERT_SOURCES, {
    message: 'A origem deve ser reading, absence ou medication_reminder.',
  })
  source?: AlertSource;

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

  @ApiPropertyOptional({
    enum: [...ALERT_SORTS],
    default: 'recent',
    description:
      'recent = mais recentes primeiro; priority = critical, warning, info e, em cada uma, mais recentes primeiro.',
  })
  @IsOptional()
  @IsIn(ALERT_SORTS, { message: 'A ordem deve ser recent ou priority.' })
  sort: AlertSort = 'recent';
}
