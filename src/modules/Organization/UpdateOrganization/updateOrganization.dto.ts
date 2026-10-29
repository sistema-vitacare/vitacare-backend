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

import {
  DOCUMENT_PATTERN,
  PHONE_PATTERN,
  Trim,
} from '../dtos/organizationFields';

/** Campo ausente nao muda; `null` limpa os opcionais, nunca `tradeName`. */
export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Clinica Exemplo', maxLength: 180 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Trim()
  @IsString({ message: 'O nome fantasia deve ser texto.' })
  @MinLength(1, { message: 'O nome fantasia nao pode ser vazio.' })
  @MaxLength(180, { message: 'O nome fantasia aceita ate 180 caracteres.' })
  tradeName?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 180 })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A razao social nao pode ser vazia.' })
  @MaxLength(180, { message: 'A razao social aceita ate 180 caracteres.' })
  legalName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @Trim()
  @Matches(DOCUMENT_PATTERN, { message: 'Informe um documento valido.' })
  @MaxLength(32, { message: 'O documento aceita ate 32 caracteres.' })
  document?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 32 })
  @IsOptional()
  @Trim()
  @Matches(PHONE_PATTERN, { message: 'Informe um telefone valido.' })
  @MaxLength(32, { message: 'O telefone aceita ate 32 caracteres.' })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 254 })
  @IsOptional()
  @Trim()
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(254, { message: 'O e-mail aceita ate 254 caracteres.' })
  email?: string | null;
}
