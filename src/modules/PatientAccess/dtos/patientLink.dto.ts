import { ApiProperty } from '@nestjs/swagger';

export const PATIENT_LINK_ROLES = [
  'responsible_professional',
  'caregiver',
  'family',
] as const;

export const PATIENT_LINK_STATUSES = ['active', 'revoked'] as const;

export class PatientLinkPatientDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Paciente Exemplo' })
  name!: string;

  @ApiProperty({ enum: ['active', 'inactive'], example: 'active' })
  status!: string;
}

export class PatientLinkUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Cuidador Exemplo' })
  name!: string;

  @ApiProperty({
    enum: ['admin', 'professional', 'caregiver', 'family'],
    example: 'caregiver',
    description: 'Perfil atual do usuario.',
  })
  profile!: string;

  @ApiProperty({ enum: ['pending', 'active', 'inactive'], example: 'active' })
  status!: string;
}

export class PatientLinkDto {
  @ApiProperty({
    format: 'uuid',
    example: '6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  })
  id!: string;

  @ApiProperty({ type: PatientLinkPatientDto })
  patient!: PatientLinkPatientDto;

  @ApiProperty({ type: PatientLinkUserDto })
  user!: PatientLinkUserDto;

  @ApiProperty({
    enum: [...PATIENT_LINK_ROLES],
    example: 'caregiver',
    description:
      'Papel no acompanhamento (`papel` do MER). Cuidador e familiar derivam do perfil do usuario; o responsavel vem do cadastro do paciente.',
  })
  role!: string;

  @ApiProperty({
    example: 'Filha',
    nullable: true,
    type: String,
    maxLength: 40,
    description: 'Tipo de vinculo em texto livre (`tipo_vinculo` do MER).',
  })
  linkType!: string | null;

  @ApiProperty({
    example: 'Visita o paciente as tercas',
    nullable: true,
    type: String,
    maxLength: 500,
    description: 'Observacao do vinculo (`observacao` do MER).',
  })
  note!: string | null;

  @ApiProperty({
    enum: [...PATIENT_LINK_STATUSES],
    example: 'active',
    description: '`revoked` quando o vinculo foi revogado (`revokedAt`).',
  })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  revokedAt!: string | null;
}

export class EligibleUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Cuidador Exemplo' })
  name!: string;

  @ApiProperty({
    enum: ['admin', 'professional', 'caregiver', 'family'],
    example: 'caregiver',
  })
  profile!: string;

  @ApiProperty({ enum: ['pending', 'active'], example: 'active' })
  status!: string;
}
