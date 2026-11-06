import { ApiProperty } from '@nestjs/swagger';

import {
  ALERT_SEVERITIES,
  ALERT_SOURCES,
  ALERT_STATUSES,
} from '@/modules/Alert/types/alert.types';
import { UserRefDto } from '@/modules/FollowUp/dtos/followUp.dto';

import { NOTIFICATION_REASONS } from '../types/notification.types';

export class NotificationAlertDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: UserRefDto })
  patient!: UserRefDto;

  @ApiProperty({ enum: [...ALERT_SOURCES], example: 'absence' })
  source!: string;

  @ApiProperty({ enum: [...ALERT_SEVERITIES], example: 'warning' })
  severity!: string;

  @ApiProperty({
    enum: [...ALERT_STATUSES],
    example: 'open',
    description: 'Estado atual do alerta (resolvido vale para todos).',
  })
  status!: string;

  @ApiProperty({ example: 'Ausência de registro' })
  title!: string;

  @ApiProperty({
    example:
      'Sem registro de Sinais vitais desde 04/11/2026 08:00; esperado a cada 1 dia.',
  })
  message!: string;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    type: NotificationAlertDto,
    description: 'Resumo do alerta; o detalhe sai em GET /alerts/{id}.',
  })
  alert!: NotificationAlertDto;

  @ApiProperty({
    enum: [...NOTIFICATION_REASONS],
    example: 'patient_link',
    description:
      'patient_link = vinculo com o paciente; organization_admin = opt-in do admin.',
  })
  reason!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Leitura deste usuario; null = nao lida.',
  })
  readAt!: string | null;

  @ApiProperty({ format: 'date-time', description: 'Quando foi entregue.' })
  createdAt!: string;
}

export class UnreadCountDto {
  @ApiProperty({ example: 3, minimum: 0 })
  unread!: number;
}

export class ReadAllResultDto {
  @ApiProperty({
    example: 3,
    minimum: 0,
    description: 'Quantas passaram a lidas.',
  })
  updated!: number;
}

export class PushConfigDto {
  @ApiProperty({ description: 'Push do navegador habilitado no servidor.' })
  enabled!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Chave publica VAPID (applicationServerKey) para o PushManager; null com push desligado.',
  })
  publicKey!: string | null;
}

export class PushSubscriptionCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
