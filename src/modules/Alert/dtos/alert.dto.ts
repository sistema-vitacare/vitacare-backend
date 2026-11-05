import { ApiProperty } from '@nestjs/swagger';

import { UserRefDto } from '@/modules/FollowUp/dtos/followUp.dto';

import { ALERT_RULE_OPERATORS, ALERT_SEVERITIES } from '../types/alert.types';

export class AlertRuleRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'Glicemia acima de 180',
    description: 'Nome atual da regra.',
  })
  name!: string;
}

export class AlertFollowUpRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time', description: 'Hora da visita.' })
  visitedAt!: string;

  @ApiProperty({
    enum: ['valid', 'annulled'],
    example: 'valid',
    description: 'Registro anulado depois do alerta continua aqui como origem.',
  })
  status!: string;
}

export class AlertFieldDto {
  @ApiProperty({ format: 'uuid' })
  key!: string;

  @ApiProperty({
    example: 'Glicemia capilar',
    description: 'Nome na versao respondida.',
  })
  name!: string;

  @ApiProperty({ nullable: true, type: String, example: 'mg/dL' })
  unit!: string | null;
}

export class AlertDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UserRefDto })
  patient!: UserRefDto;

  @ApiProperty({
    enum: ['reading'],
    example: 'reading',
    description: 'reading = valor registrado em acompanhamento.',
  })
  source!: string;

  @ApiProperty({ enum: [...ALERT_SEVERITIES], example: 'warning' })
  severity!: string;

  @ApiProperty({
    enum: ['open'],
    example: 'open',
    description: 'Leitura e resolucao ainda nao existem (BE-17).',
  })
  status!: string;

  @ApiProperty({
    example: 'Glicemia acima de 180',
    description: 'Nome da regra no disparo.',
  })
  title!: string;

  @ApiProperty({
    example: 'Glicemia capilar: 250 mg/dL (maior que 180 mg/dL).',
  })
  message!: string;

  @ApiProperty({ type: AlertRuleRefDto })
  rule!: AlertRuleRefDto;

  @ApiProperty({ type: AlertFollowUpRefDto })
  followUp!: AlertFollowUpRefDto;

  @ApiProperty({ type: AlertFieldDto })
  field!: AlertFieldDto;

  @ApiProperty({
    example: '250',
    description: 'Valor registrado, texto decimal canonico.',
  })
  value!: string;

  @ApiProperty({
    enum: [...ALERT_RULE_OPERATORS],
    example: 'gt',
    description: 'Operador no disparo.',
  })
  operator!: string;

  @ApiProperty({ example: 180, description: 'Referencia no disparo.' })
  referenceValue!: number;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;
}
