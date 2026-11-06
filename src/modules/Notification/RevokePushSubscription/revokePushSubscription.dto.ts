import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RevokePushSubscriptionDto {
  @ApiProperty({
    maxLength: 1000,
    description: 'endpoint de PushManager.getSubscription() deste navegador.',
  })
  @IsString({ message: 'Informe o endpoint.' })
  @MinLength(1, { message: 'Informe o endpoint.' })
  @MaxLength(1000, { message: 'O endpoint tem no maximo 1000 caracteres.' })
  endpoint!: string;
}
