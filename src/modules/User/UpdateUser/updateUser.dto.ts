import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { IsCpf } from '@/common/validation/isCpf.decorator';
import {
  PHONE_PATTERN,
  Trim,
} from '@/modules/Organization/dtos/organizationFields';

import { LowerTrim, OnlyDigits } from '../dtos/userFields';

const present = (_object: unknown, value: unknown) => value !== undefined;

/**
 * Campo ausente nao muda; `null` so limpa o telefone. Perfil e status tem
 * rotas proprias.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ana Exemplo', maxLength: 180 })
  @ValidateIf(present)
  @Trim()
  @IsString({ message: 'O nome deve ser texto.' })
  @MinLength(1, { message: 'O nome nao pode ser vazio.' })
  @MaxLength(180, { message: 'O nome aceita ate 180 caracteres.' })
  name?: string;

  @ApiPropertyOptional({
    example: 'ana@example.test',
    maxLength: 254,
    description: 'Unico na organizacao; gravado em minusculas.',
  })
  @ValidateIf(present)
  @LowerTrim()
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(254, { message: 'O e-mail aceita ate 254 caracteres.' })
  email?: string;

  @ApiPropertyOptional({
    example: '52998224725',
    description:
      'CPF com ou sem pontuacao, com digitos verificadores validos; unico na organizacao.',
  })
  @ValidateIf(present)
  @IsCpf({ message: 'Informe um CPF valido.' })
  @OnlyDigits()
  cpf?: string;

  @ApiPropertyOptional({
    example: '(11) 99999-0000',
    maxLength: 32,
    nullable: true,
    type: String,
    description: '`null` remove o telefone.',
  })
  @IsOptional()
  @Trim()
  @Matches(PHONE_PATTERN, { message: 'Informe um telefone valido.' })
  @MaxLength(32, { message: 'O telefone aceita ate 32 caracteres.' })
  phone?: string | null;
}
