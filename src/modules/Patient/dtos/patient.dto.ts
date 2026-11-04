import { ApiProperty } from '@nestjs/swagger';

export const PATIENT_STATUSES = ['active', 'inactive'] as const;

export const PATIENT_SEXES = ['female', 'male', 'other'] as const;

export class PatientAddressDto {
  @ApiProperty({
    example: '01310100',
    nullable: true,
    type: String,
    description: 'CEP com 8 digitos.',
  })
  zipCode!: string | null;

  @ApiProperty({ example: 'Avenida Exemplo', nullable: true, type: String })
  street!: string | null;

  @ApiProperty({ example: '100', nullable: true, type: String })
  number!: string | null;

  @ApiProperty({ example: 'Centro', nullable: true, type: String })
  district!: string | null;

  @ApiProperty({ example: 'Sao Paulo', nullable: true, type: String })
  city!: string | null;

  @ApiProperty({
    example: 'SP',
    nullable: true,
    type: String,
    description: 'Sigla da UF.',
  })
  state!: string | null;
}

export class PatientResponsibleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Profissional Exemplo' })
  name!: string;

  @ApiProperty({
    enum: ['pending', 'active', 'inactive'],
    example: 'active',
    description: 'Status do usuario responsavel.',
  })
  status!: string;
}

export class PatientDto {
  @ApiProperty({
    format: 'uuid',
    example: '3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c',
  })
  id!: string;

  @ApiProperty({ example: 'Paciente Exemplo', maxLength: 180 })
  name!: string;

  @ApiProperty({ format: 'date', example: '1948-03-12' })
  birthDate!: string;

  @ApiProperty({
    enum: [...PATIENT_SEXES],
    nullable: true,
    type: String,
    example: 'female',
  })
  sex!: (typeof PATIENT_SEXES)[number] | null;

  @ApiProperty({
    example: '52998224725',
    nullable: true,
    type: String,
    description:
      'CPF com 11 digitos. Na listagem sai mascarado (`***.982.247-**`).',
  })
  cpf!: string | null;

  @ApiProperty({ example: '(11) 98765-4321', nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({
    example: 'paciente@example.test',
    nullable: true,
    type: String,
  })
  email!: string | null;

  @ApiProperty({ type: PatientAddressDto })
  address!: PatientAddressDto;

  @ApiProperty({
    example: 'Hipertensao arterial',
    nullable: true,
    type: String,
  })
  mainCondition!: string | null;

  @ApiProperty({ type: [String], example: ['Diabetes tipo 2'] })
  secondaryConditions!: string[];

  @ApiProperty({
    example: 'Plano de saude exemplo',
    nullable: true,
    type: String,
    description:
      'Plano de saude do paciente; nao e o plano comercial da organizacao.',
  })
  healthPlan!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Observacao sintetica.',
  })
  notes!: string | null;

  @ApiProperty({
    enum: [...PATIENT_STATUSES],
    example: 'active',
    description: 'Situacao cadastral; nao e a situacao clinica do paciente.',
  })
  status!: (typeof PATIENT_STATUSES)[number];

  @ApiProperty({
    type: PatientResponsibleDto,
    nullable: true,
    description:
      'Profissional responsavel pelo acompanhamento (vinculo vigente).',
  })
  responsible!: PatientResponsibleDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Momento da inativacao; `null` enquanto ativo.',
  })
  deletedAt!: string | null;
}
