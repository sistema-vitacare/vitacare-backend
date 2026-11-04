import { ApiProperty } from '@nestjs/swagger';

import {
  PLAN_CHANGE_REQUEST_STATUSES,
  PLAN_FEATURES,
  PLAN_TERM_ORIGINS,
  PLAN_TERM_STATUSES,
  type PlanChangeRequestStatus,
  type PlanFeature,
  type PlanTermOrigin,
  type PlanTermStatus,
} from '../types/plan.types';

export class PlanSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'basic' })
  code!: string;

  @ApiProperty({ example: 'Basic' })
  name!: string;
}

export class PlanDto extends PlanSummaryDto {
  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({
    minimum: 0,
    description: 'Limite de usuarios do catalogo (pendentes + ativos).',
  })
  userLimit!: number;

  @ApiProperty({ minimum: 0, description: 'Limite de pacientes do catalogo.' })
  patientLimit!: number;

  @ApiProperty({ enum: PLAN_FEATURES, isArray: true })
  features!: PlanFeature[];

  @ApiProperty({
    nullable: true,
    example: '499.00',
    description:
      'Mensalidade de referencia em reais, com duas casas, como texto (Quadro 2 do TCC). Plano expansivel soma adicional conforme o volume contratado. `null`: sem preco publicado.',
  })
  monthlyPrice!: string | null;

  @ApiProperty({
    example: false,
    description:
      'Aceita expansao de limites conforme contratacao (so o Enterprise, pelo Quadro 2). Plano sem expansao nao aceita limite personalizado.',
  })
  expandable!: boolean;
}

export class PlanTermDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Fim da vigencia; `null` = sem vencimento.',
  })
  endsAt!: string | null;

  @ApiProperty({
    enum: PLAN_TERM_STATUSES,
    description: '`expired` bloqueia novos cadastros, nunca a leitura.',
  })
  status!: PlanTermStatus;

  @ApiProperty({ enum: PLAN_TERM_ORIGINS })
  origin!: PlanTermOrigin;

  @ApiProperty({
    nullable: true,
    minimum: 0,
    description: 'Limite de usuarios personalizado; `null` = o do catalogo.',
  })
  userLimit!: number | null;

  @ApiProperty({
    nullable: true,
    minimum: 0,
    description: 'Limite de pacientes personalizado; `null` = o do catalogo.',
  })
  patientLimit!: number | null;
}

export class PlanLimitsDto {
  @ApiProperty({ minimum: 0 })
  users!: number;

  @ApiProperty({ minimum: 0 })
  patients!: number;
}

export class PlanUsageDto {
  @ApiProperty({
    minimum: 0,
    description:
      'Usuarios `pending` + `active` (mesma contagem do limite). Pode passar do limite apos rebaixamento de plano.',
  })
  users!: number;

  @ApiProperty({
    minimum: 0,
    description:
      'Pacientes `active` (mesma contagem do limite). Pode passar do limite apos rebaixamento de plano.',
  })
  patients!: number;
}

export class PlanChangeRequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({
    type: PlanSummaryDto,
    description: 'Plano corrente no momento do pedido.',
  })
  currentPlan!: PlanSummaryDto;

  @ApiProperty({ type: PlanSummaryDto })
  requestedPlan!: PlanSummaryDto;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: PLAN_CHANGE_REQUEST_STATUSES })
  status!: PlanChangeRequestStatus;

  @ApiProperty({ format: 'uuid' })
  requestedByUserId!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Presente apenas para a administracao da plataforma.',
  })
  decidedByUserId!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  decidedAt!: string | null;

  @ApiProperty({ nullable: true })
  decisionNote!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class OrganizationPlanDto {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ type: PlanDto })
  plan!: PlanDto;

  @ApiProperty({ type: PlanTermDto })
  term!: PlanTermDto;

  @ApiProperty({
    type: PlanLimitsDto,
    description: 'Limites efetivos: personalizado do termo ou do catalogo.',
  })
  limits!: PlanLimitsDto;

  @ApiProperty({ type: PlanUsageDto })
  usage!: PlanUsageDto;

  @ApiProperty({ type: PlanChangeRequestDto, nullable: true })
  pendingChangeRequest!: PlanChangeRequestDto | null;
}
