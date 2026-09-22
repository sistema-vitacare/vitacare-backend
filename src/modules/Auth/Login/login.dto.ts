import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Codigo publico da organizacao: minusculas, digitos e hifens simples. */
export const ORGANIZATION_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class LoginDto {
  @ApiProperty({ example: 'clinica-exemplo', minLength: 3, maxLength: 50 })
  @IsString()
  @Matches(ORGANIZATION_CODE_PATTERN, {
    message: 'Informe o codigo da organizacao em minusculas, com hifens.',
  })
  @MinLength(3)
  @MaxLength(50)
  organizationCode!: string;

  @ApiProperty({ example: 'usuario@example.test', maxLength: 254 })
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    description: 'Senha em caracteres; espacos e Unicode sao preservados.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty({
    enum: ['authenticated', 'password_change_required'],
    description:
      '`password_change_required` significa sessao restrita: so primeiro acesso e logout.',
  })
  state!: 'authenticated' | 'password_change_required';

  @ApiProperty({ description: 'Token opaco; enviar como `Bearer`.' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({
    format: 'date-time',
    description: 'Prazo absoluto da sessao.',
  })
  expiresAt!: string;

  @ApiPropertyOptional({
    example: 1800,
    description: 'Inatividade tolerada; ausente na sessao restrita.',
  })
  idleTimeoutSeconds?: number;
}
