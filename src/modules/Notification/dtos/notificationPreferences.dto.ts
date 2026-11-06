import { ApiProperty } from '@nestjs/swagger';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsObject,
  ValidateNested,
} from 'class-validator';

const BOOLEAN = { message: 'Informe true ou false.' };

export class NotificationChannelsDto {
  @ApiProperty({ description: 'Caixa interna do sistema.' })
  @IsBoolean(BOOLEAN)
  inApp!: boolean;

  @ApiProperty({
    description: 'Push do navegador (so chega com inscricao ativa).',
  })
  @IsBoolean(BOOLEAN)
  push!: boolean;

  @ApiProperty({ description: 'E-mail (so sai com SMTP habilitado).' })
  @IsBoolean(BOOLEAN)
  email!: boolean;
}

const Channels = (description: string): PropertyDecorator => {
  const decorators = [
    ApiProperty({ type: NotificationChannelsDto, description }),
    IsDefined({ message: 'Informe os tres canais.' }),
    IsObject({ message: 'Informe os tres canais como objeto.' }),
    ValidateNested(),
    // Sem `@Type`: com uma lista, o class-transformer chamaria `.push` dela.
    Transform(({ value }: { value: unknown }) =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? plainToInstance(NotificationChannelsDto, value)
        : value,
    ),
  ];

  return (target, key) => decorators.forEach((apply) => apply(target, key));
};

/** Matriz completa de recebimento; substitui a anterior. */
export class UpdateNotificationPreferencesDto {
  @ApiProperty({
    description:
      'Receber os alertas de todos os pacientes da organizacao. So administrador.',
  })
  @IsBoolean(BOOLEAN)
  organizationAlerts!: boolean;

  @Channels('Alerta por valor registrado fora da regra.')
  reading!: NotificationChannelsDto;

  @Channels('Ausencia de registro no prazo.')
  absence!: NotificationChannelsDto;

  @Channels('Lembrete de horario de medicamento.')
  medicationReminder!: NotificationChannelsDto;
}

export class NotificationPreferencesDto extends UpdateNotificationPreferencesDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Ultima gravacao; null = nunca gravadas (padroes).',
  })
  updatedAt!: string | null;
}
