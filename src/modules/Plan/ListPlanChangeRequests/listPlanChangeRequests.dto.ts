import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';

import {
  PLAN_CHANGE_REQUEST_STATUSES,
  type PlanChangeRequestStatus,
} from '../types/plan.types';

export class ListPlanChangeRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PLAN_CHANGE_REQUEST_STATUSES })
  @IsOptional()
  @IsIn(PLAN_CHANGE_REQUEST_STATUSES, {
    message: 'O status deve ser pending, approved, rejected ou cancelled.',
  })
  status?: PlanChangeRequestStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filtra por organizacao; so a plataforma usa. No tenant e ignorado: vale a organizacao da sessao.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Informe o identificador da organizacao.' })
  organizationId?: string;
}
