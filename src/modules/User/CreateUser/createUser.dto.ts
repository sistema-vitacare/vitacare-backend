import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { IsCpf } from '@/common/validation/isCpf.decorator';
import {
  TENANT_PROFILE_CODES,
  type TenantProfileCode,
} from '@/modules/Access/access.permissions';
import {
  PHONE_PATTERN,
  Trim,
} from '@/modules/Organization/dtos/organizationFields';

import { UserDto, UserInvitationResponseDto } from '../dtos/user.dto';
import { LowerTrim, OnlyDigits } from '../dtos/userFields';

export class CreateUserDto {
  @ApiProperty({ example: 'Ana Exemplo', maxLength: 180 })
  @Trim()
  @IsString({ message: 'Informe o nome do usuario.' })
  @MinLength(1, { message: 'Informe o nome do usuario.' })
  @MaxLength(180, { message: 'O nome aceita ate 180 caracteres.' })
  name!: string;

  @ApiProperty({
    example: 'ana@example.test',
    maxLength: 254,
    description: 'Unico na organizacao; gravado em minusculas.',
  })
  @LowerTrim()
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(254, { message: 'O e-mail aceita ate 254 caracteres.' })
  email!: string;

  @ApiProperty({
    example: '52998224725',
    description:
      'CPF com ou sem pontuacao, com digitos verificadores validos; unico na organizacao e armazenado com 11 digitos.',
  })
  @IsCpf({ message: 'Informe um CPF valido.' })
  @OnlyDigits()
  cpf!: string;

  @ApiPropertyOptional({ example: '(11) 99999-0000', maxLength: 32 })
  @IsOptional()
  @Trim()
  @Matches(PHONE_PATTERN, { message: 'Informe um telefone valido.' })
  @MaxLength(32, { message: 'O telefone aceita ate 32 caracteres.' })
  phone?: string;

  @ApiProperty({
    enum: [...TENANT_PROFILE_CODES],
    example: 'caregiver',
    description: 'Perfil de acesso do usuario na organizacao.',
  })
  @IsIn(TENANT_PROFILE_CODES, {
    message: 'O perfil deve ser admin, professional, caregiver ou family.',
  })
  profileCode!: TenantProfileCode;
}

export class CreateUserResponseDto extends UserInvitationResponseDto {
  @ApiProperty({
    type: UserDto,
    description:
      'Usuario cadastrado, com status `pending` ate o primeiro acesso.',
  })
  user!: UserDto;
}
