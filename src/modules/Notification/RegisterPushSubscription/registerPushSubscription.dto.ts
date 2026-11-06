import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export class PushSubscriptionKeysDto {
  @ApiProperty({
    maxLength: 200,
    description: 'Chave publica ECDH P-256 do navegador, base64url.',
  })
  @IsString({ message: 'Informe a chave p256dh.' })
  @MaxLength(200, { message: 'A chave p256dh tem no maximo 200 caracteres.' })
  @Matches(BASE64URL, { message: 'A chave p256dh deve ser base64url.' })
  p256dh!: string;

  @ApiProperty({
    maxLength: 100,
    description: 'Segredo de autenticacao do navegador, base64url.',
  })
  @IsString({ message: 'Informe o segredo auth.' })
  @MaxLength(100, { message: 'O segredo auth tem no maximo 100 caracteres.' })
  @Matches(BASE64URL, { message: 'O segredo auth deve ser base64url.' })
  auth!: string;
}

/** O `PushSubscription.toJSON()` do navegador, sem `expirationTime`. */
export class RegisterPushSubscriptionDto {
  @ApiProperty({
    maxLength: 1000,
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
    description:
      'URL do servico de push do navegador (https; Google, Mozilla, Microsoft ou Apple).',
  })
  @IsString({ message: 'Informe o endpoint.' })
  @MinLength(1, { message: 'Informe o endpoint.' })
  @MaxLength(1000, { message: 'O endpoint tem no maximo 1000 caracteres.' })
  endpoint!: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @IsDefined({ message: 'Informe as chaves da inscricao.' })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}
