import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { onlyDigits } from '@/common/validation/cpf';
import { IsCpf } from '@/common/validation/isCpf.decorator';
import { ORGANIZATION_CODE_PATTERN } from '@/modules/Auth/Login/login.dto';

import { OrganizationDto } from '../dtos/organization.dto';
import {
  DOCUMENT_PATTERN,
  PHONE_PATTERN,
  Trim,
} from '../dtos/organizationFields';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateOrganizationAdministratorDto {
  @ApiProperty({ example: 'Administradora Exemplo', maxLength: 180 })
  @Trim()
  @IsString({ message: 'Informe o nome do administrador.' })
  @MinLength(1, { message: 'Informe o nome do administrador.' })
  @MaxLength(180, { message: 'O nome aceita ate 180 caracteres.' })
  name!: string;

  @ApiProperty({ example: 'admin@example.test', maxLength: 254 })
  @Transform(lowerTrim)
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(254, { message: 'O e-mail aceita ate 254 caracteres.' })
  email!: string;

  @ApiProperty({
    example: '52998224725',
    description: 'CPF com ou sem pontuacao; armazenado com 11 digitos.',
  })
  @IsCpf({ message: 'Informe um CPF valido.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? onlyDigits(value) : value,
  )
  cpf!: string;

  @ApiPropertyOptional({ example: '(11) 99999-0000', maxLength: 32 })
  @IsOptional()
  @Trim()
  @Matches(PHONE_PATTERN, { message: 'Informe um telefone valido.' })
  @MaxLength(32, { message: 'O telefone aceita ate 32 caracteres.' })
  phone?: string;
}

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'clinica-exemplo',
    minLength: 3,
    maxLength: 50,
    description: 'Codigo publico do login. Nao pode ser alterado depois.',
  })
  @Transform(lowerTrim)
  @IsString()
  @Matches(ORGANIZATION_CODE_PATTERN, {
    message: 'Informe o codigo em minusculas, digitos e hifens simples.',
  })
  @MinLength(3, { message: 'O codigo precisa ter ao menos 3 caracteres.' })
  @MaxLength(50, { message: 'O codigo aceita ate 50 caracteres.' })
  code!: string;

  @ApiProperty({ example: 'Clinica Exemplo', maxLength: 180 })
  @Trim()
  @IsString({ message: 'Informe o nome fantasia.' })
  @MinLength(1, { message: 'Informe o nome fantasia.' })
  @MaxLength(180, { message: 'O nome fantasia aceita ate 180 caracteres.' })
  tradeName!: string;

  @ApiPropertyOptional({ example: 'Clinica Exemplo LTDA', maxLength: 180 })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: 'A razao social nao pode ser vazia.' })
  @MaxLength(180, { message: 'A razao social aceita ate 180 caracteres.' })
  legalName?: string;

  @ApiPropertyOptional({
    example: '00.000.000/0001-00',
    maxLength: 32,
    description: 'Unico entre todas as organizacoes apos normalizacao.',
  })
  @IsOptional()
  @Trim()
  @Matches(DOCUMENT_PATTERN, { message: 'Informe um documento valido.' })
  @MaxLength(32, { message: 'O documento aceita ate 32 caracteres.' })
  document?: string;

  @ApiPropertyOptional({ example: '(11) 3000-0000', maxLength: 32 })
  @IsOptional()
  @Trim()
  @Matches(PHONE_PATTERN, { message: 'Informe um telefone valido.' })
  @MaxLength(32, { message: 'O telefone aceita ate 32 caracteres.' })
  phone?: string;

  @ApiPropertyOptional({ example: 'contato@example.test', maxLength: 254 })
  @IsOptional()
  @Trim()
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(254, { message: 'O e-mail aceita ate 254 caracteres.' })
  email?: string;

  @ApiProperty({ format: 'uuid', description: 'Plano de uso ativo.' })
  @IsUUID('all', { message: 'Informe o identificador UUID do plano.' })
  usagePlanId!: string;

  @ApiProperty({ type: CreateOrganizationAdministratorDto })
  @ValidateNested()
  @Type(() => CreateOrganizationAdministratorDto)
  administrator!: CreateOrganizationAdministratorDto;
}

export class CreatedAdministratorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Administradora Exemplo' })
  name!: string;

  @ApiProperty({ example: 'admin@example.test' })
  email!: string;
}

export class CreateOrganizationResponseDto {
  @ApiProperty({ type: OrganizationDto })
  organization!: OrganizationDto;

  @ApiProperty({ type: CreatedAdministratorDto })
  administrator!: CreatedAdministratorDto;

  @ApiProperty({
    description:
      'Senha provisoria do primeiro administrador, exibida uma unica vez; a troca e exigida no primeiro acesso.',
  })
  temporaryPassword!: string;
}
