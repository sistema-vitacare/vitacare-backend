import { ApiProperty } from '@nestjs/swagger';

import { UserRefDto } from '@/modules/FollowUp/dtos/followUp.dto';

import { FREQUENCY_UNITS } from '@/modules/Form/types/form.types';

import {
  ALERT_RULE_OPERATORS,
  ALERT_SEVERITIES,
  ALERT_SOURCES,
} from '../types/alert.types';

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

export class AlertOriginRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sinais vitais', description: 'Nome atual.' })
  name!: string;
}

export class AlertFrequencyDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 365 })
  interval!: number;

  @ApiProperty({ enum: [...FREQUENCY_UNITS], example: 'days' })
  unit!: string;
}

export class AlertAbsenceDto {
  @ApiProperty({
    type: AlertOriginRefDto,
    description: 'Formulario sem registro.',
  })
  form!: AlertOriginRefDto;

  @ApiProperty({
    format: 'date-time',
    description:
      'Inicio da contagem: ultimo envio valido do formulario ou inicio do monitoramento.',
  })
  since!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Prazo vencido sem registro (since + k x frequencia).',
  })
  dueAt!: string;

  @ApiProperty({
    type: AlertFrequencyDto,
    description: 'Frequencia esperada no disparo.',
  })
  frequency!: AlertFrequencyDto;
}

export class AlertMedicationReminderDto {
  @ApiProperty({ type: AlertOriginRefDto })
  medication!: AlertOriginRefDto;

  @ApiProperty({ format: 'uuid', description: 'Linha da agenda que disparou.' })
  reminderId!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Horario programado (pode ser anterior a generatedAt).',
  })
  scheduledAt!: string;
}

export class AlertDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UserRefDto })
  patient!: UserRefDto;

  @ApiProperty({
    enum: [...ALERT_SOURCES],
    example: 'reading',
    description:
      'reading = valor registrado; absence = ausencia de registro; medication_reminder = horario de medicamento. So o bloco da origem vem preenchido.',
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

  @ApiProperty({
    type: AlertRuleRefDto,
    nullable: true,
    description: 'So em reading.',
  })
  rule!: AlertRuleRefDto | null;

  @ApiProperty({
    type: AlertFollowUpRefDto,
    nullable: true,
    description: 'So em reading.',
  })
  followUp!: AlertFollowUpRefDto | null;

  @ApiProperty({
    type: AlertFieldDto,
    nullable: true,
    description: 'So em reading.',
  })
  field!: AlertFieldDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '250',
    description: 'Valor registrado, texto decimal canonico. So em reading.',
  })
  value!: string | null;

  @ApiProperty({
    enum: [...ALERT_RULE_OPERATORS],
    nullable: true,
    example: 'gt',
    description: 'Operador no disparo. So em reading.',
  })
  operator!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 180,
    description: 'Referencia no disparo. So em reading.',
  })
  referenceValue!: number | null;

  @ApiProperty({
    type: AlertAbsenceDto,
    nullable: true,
    description: 'So em absence.',
  })
  absence!: AlertAbsenceDto | null;

  @ApiProperty({
    type: AlertMedicationReminderDto,
    nullable: true,
    description: 'So em medication_reminder.',
  })
  medicationReminder!: AlertMedicationReminderDto | null;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;
}
