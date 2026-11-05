import { ApiProperty } from '@nestjs/swagger';

import { UserRefDto } from '@/modules/FollowUp/dtos/followUp.dto';

import {
  ALERT_RULE_OPERATORS,
  ALERT_RULE_STATUSES,
  ALERT_SEVERITIES,
  RULE_FIELD_TYPES,
} from '../types/alert.types';

export class AlertRuleFormDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Acompanhamento Geral' })
  name!: string;
}

export class AlertRuleFieldDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Identidade do campo entre versoes.',
  })
  key!: string;

  @ApiProperty({
    example: 'Glicemia capilar',
    description: 'Nome na versao publicada mais recente que contem o campo.',
  })
  name!: string;

  @ApiProperty({ enum: [...RULE_FIELD_TYPES], example: 'number' })
  fieldType!: string;

  @ApiProperty({ nullable: true, type: String, example: 'mg/dL' })
  unit!: string | null;
}

export class AlertRuleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: AlertRuleFormDto })
  form!: AlertRuleFormDto;

  @ApiProperty({ type: AlertRuleFieldDto })
  field!: AlertRuleFieldDto;

  @ApiProperty({
    type: UserRefDto,
    nullable: true,
    description: '`null` = regra geral do formulario.',
  })
  patient!: UserRefDto | null;

  @ApiProperty({ example: 'Glicemia acima de 180' })
  name!: string;

  @ApiProperty({ nullable: true, type: String, example: null })
  description!: string | null;

  @ApiProperty({ enum: [...ALERT_RULE_OPERATORS], example: 'gt' })
  operator!: string;

  @ApiProperty({ example: 180, description: 'Ate 3 casas decimais.' })
  referenceValue!: number;

  @ApiProperty({ enum: [...ALERT_SEVERITIES], example: 'warning' })
  severity!: string;

  @ApiProperty({ enum: [...ALERT_RULE_STATUSES], example: 'active' })
  status!: string;

  @ApiProperty({ type: UserRefDto, description: 'Quem configurou a regra.' })
  createdBy!: UserRefDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    example: null,
  })
  deactivatedAt!: string | null;
}
