import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  ALERT_RULE_STATUSES,
  type AlertRuleStatus,
} from '../types/alert.types';

export class ListAlertRulesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'So deste formulario.' })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do formulario.' })
  formId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'So as regras proprias deste paciente.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId?: string;

  @ApiPropertyOptional({
    enum: [...ALERT_RULE_STATUSES],
    description: 'Omitido lista ativas e inativas (ativas primeiro).',
  })
  @IsOptional()
  @IsIn(ALERT_RULE_STATUSES, {
    message: 'O status deve ser active ou inactive.',
  })
  status?: AlertRuleStatus;
}
