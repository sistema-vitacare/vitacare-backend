import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PickType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { GetPatientEvolutionQueryDto } from '@/modules/Indicator/GetPatientEvolution/getPatientEvolution.dto';

import {
  AUDIT_SEVERITIES,
  type AuditSeverity,
} from '../policies/auditCatalog.policy';
import {
  AUDIT_ACTOR_TYPES,
  type AuditActorType,
} from '../types/auditEvent.types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Filtros da consulta e da exportacao (UC06 passo 2, Figura 45). */
export class AuditEventFilterQueryDto extends PickType(
  GetPatientEvolutionQueryDto,
  ['from', 'to'] as const,
) {
  @ApiPropertyOptional({
    example: 'user.deactivated',
    description: 'Codigo exato da acao (GET /audit-events/actions).',
  })
  @IsOptional()
  @Transform(trim)
  @MaxLength(80, { message: 'A acao tem no maximo 80 caracteres.' })
  action?: string;

  @ApiPropertyOptional({ enum: AUDIT_SEVERITIES })
  @IsOptional()
  @IsIn(AUDIT_SEVERITIES, {
    message: 'A gravidade deve ser info, normal, warning ou critical.',
  })
  severity?: AuditSeverity;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuario responsavel.' })
  @IsOptional()
  @IsUUID('all', { message: 'Informe o identificador do usuario.' })
  actorUserId?: string;

  @ApiPropertyOptional({
    enum: AUDIT_ACTOR_TYPES,
    description: '`system` = eventos de Sistema/Automacao.',
  })
  @IsOptional()
  @IsIn(AUDIT_ACTOR_TYPES, { message: 'O autor deve ser user ou system.' })
  actorType?: AuditActorType;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Busca no nome do responsavel ou no codigo/rotulo da acao, sem diferenciar maiusculas (rotulo tambem sem acento).',
  })
  @IsOptional()
  @Transform(trim)
  @MaxLength(100, { message: 'A busca tem no maximo 100 caracteres.' })
  search?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filtra por organizacao; so o master usa (sem ele, todas). No tenant e ignorado: vale a organizacao da sessao.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Informe o identificador da organizacao.' })
  organizationId?: string;
}

export class ListAuditEventsQueryDto extends IntersectionType(
  AuditEventFilterQueryDto,
  PaginationQueryDto,
) {}

export class AuditRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nome Exemplo' })
  name!: string;
}

export class AuditProfileDto {
  @ApiProperty({ example: 'admin' })
  code!: string;

  @ApiProperty({ example: 'Administrador' })
  name!: string;
}

export class AuditActorDto {
  @ApiProperty({ enum: AUDIT_ACTOR_TYPES })
  type!: AuditActorType;

  @ApiProperty({ type: AuditRefDto, nullable: true })
  user!: AuditRefDto | null;

  @ApiProperty({
    type: AuditProfileDto,
    nullable: true,
    description:
      'Perfil no instante da acao; nulo em evento de sistema e nos anteriores ao BE-23.',
  })
  profile!: AuditProfileDto | null;
}

export class AuditEntityDto {
  @ApiProperty({ example: 'patient' })
  type!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  id!: string | null;

  @ApiProperty({
    nullable: true,
    example: 'Paciente Exemplo',
    description:
      'Nome do usuario, organizacao, paciente, formulario ou medicamento; nulo nos demais tipos e, para o master, nos nomes clinicos de outra organizacao.',
  })
  label!: string | null;
}

export class AuditEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ type: AuditRefDto })
  organization!: AuditRefDto;

  @ApiProperty({ type: AuditActorDto })
  actor!: AuditActorDto;

  @ApiProperty({ example: 'follow_up.created' })
  action!: string;

  @ApiProperty({ example: 'Registrou acompanhamento' })
  actionLabel!: string;

  @ApiProperty({ enum: AUDIT_SEVERITIES })
  severity!: AuditSeverity;

  @ApiProperty({ type: AuditEntityDto })
  entity!: AuditEntityDto;

  @ApiProperty({
    nullable: true,
    example: '192.0.2.10',
    description:
      'IP do cliente; nulo em evento de sistema e nos anteriores ao BE-23.',
  })
  ipAddress!: string | null;

  @ApiProperty({ nullable: true, example: 'req-1' })
  requestId!: string | null;
}

export class AuditEventDetailDto extends AuditEventDto {
  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'Valores anteriores como gravados (ids, codigos, nomes de campos).',
  })
  beforeValues!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description:
      'Valores novos como gravados; sem senha, token ou valor clinico.',
  })
  afterValues!: Record<string, unknown> | null;
}

export class AuditActionDto {
  @ApiProperty({ example: 'user.deactivated' })
  action!: string;

  @ApiProperty({ example: 'Inativou usuário' })
  label!: string;

  @ApiProperty({
    enum: AUDIT_SEVERITIES,
    nullable: true,
    description: 'Nulo em alert.generated: vale a severidade do alerta.',
  })
  severity!: AuditSeverity | null;
}
