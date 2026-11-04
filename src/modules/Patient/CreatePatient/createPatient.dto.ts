import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsCpf } from '@/common/validation/isCpf.decorator';
import {
  PHONE_PATTERN,
  Trim,
} from '@/modules/Organization/dtos/organizationFields';
import { LowerTrim, OnlyDigits } from '@/modules/User/dtos/userFields';

import { PATIENT_SEXES } from '../dtos/patient.dto';
import { PatientAddressInputDto } from '../dtos/patientAddress.dto';
import { IsBirthDate, PatientText } from '../dtos/patientFields';
import type { PatientSex } from '../types/patient.types';

/** Cadastro do UC07: obrigatorios sao nome, nascimento e responsavel. */
export class CreatePatientDto {
  @ApiProperty({ example: 'Paciente Exemplo', maxLength: 180 })
  @PatientText('O nome', 180)
  name!: string;

  @ApiProperty({
    format: 'date',
    example: '1948-03-12',
    description: 'Data de nascimento `YYYY-MM-DD`, entre 1900-01-01 e hoje.',
  })
  @IsBirthDate({
    message:
      'Informe uma data de nascimento valida, no formato AAAA-MM-DD e nao futura.',
  })
  birthDate!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Profissional responsavel: usuario `pending` ou `active` da organizacao com perfil `professional` ou `admin`.',
  })
  @LowerTrim()
  @IsUUID('all', {
    message: 'Informe o identificador do profissional responsavel.',
  })
  responsibleUserId!: string;

  @ApiPropertyOptional({
    enum: [...PATIENT_SEXES],
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsIn(PATIENT_SEXES, { message: 'O sexo deve ser female, male ou other.' })
  sex?: PatientSex | null;

  @ApiPropertyOptional({
    example: '529.982.247-25',
    nullable: true,
    type: String,
    description:
      'CPF com ou sem pontuacao, com digitos verificadores validos; unico na organizacao (inclusive entre inativos) e gravado com 11 digitos.',
  })
  @IsOptional()
  @IsCpf({ message: 'Informe um CPF valido.' })
  @OnlyDigits()
  cpf?: string | null;

  @ApiPropertyOptional({
    example: '(11) 98765-4321',
    maxLength: 32,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Trim()
  @Matches(PHONE_PATTERN, { message: 'Informe um telefone valido.' })
  @MaxLength(32, { message: 'O telefone aceita ate 32 caracteres.' })
  phone?: string | null;

  @ApiPropertyOptional({
    example: 'paciente@example.test',
    maxLength: 254,
    nullable: true,
    type: String,
    description: 'Contato; sem unicidade. Gravado em minusculas.',
  })
  @IsOptional()
  @LowerTrim()
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(254, { message: 'O e-mail aceita ate 254 caracteres.' })
  email?: string | null;

  @ApiPropertyOptional({
    type: PatientAddressInputDto,
    nullable: true,
    description:
      'Endereco; cada parte e opcional. `null` limpa todas as partes.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatientAddressInputDto)
  address?: PatientAddressInputDto | null;

  @ApiPropertyOptional({
    example: 'Hipertensao arterial',
    maxLength: 180,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @PatientText('A condicao principal', 180)
  mainCondition?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['Diabetes tipo 2'],
    maxItems: 20,
    nullable: true,
    description:
      'Ate 20 condicoes de ate 180 caracteres. `null` ou `[]` limpa.',
  })
  @IsOptional()
  @IsArray({ message: 'As condicoes secundarias devem ser uma lista.' })
  @ArrayMaxSize(20, { message: 'Informe ate 20 condicoes secundarias.' })
  @PatientText('Cada condicao secundaria', 180, { each: true })
  secondaryConditions?: string[] | null;

  @ApiPropertyOptional({
    example: 'Plano de saude exemplo',
    maxLength: 180,
    nullable: true,
    type: String,
    description:
      'Plano de saude do paciente (texto livre); nao e o plano comercial da organizacao.',
  })
  @IsOptional()
  @PatientText('O plano de saude', 180)
  healthPlan?: string | null;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true, type: String })
  @IsOptional()
  @PatientText('As observacoes', 2000)
  notes?: string | null;
}
