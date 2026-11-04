import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { PatientText } from '@/modules/Patient/dtos/patientFields';
import { LowerTrim } from '@/modules/User/dtos/userFields';

export class CreatePatientLinkDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Paciente ativo da organizacao.',
  })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Usuario `pending` ou `active` da organizacao com perfil `caregiver` ou `family`; o papel do vinculo vem desse perfil.',
  })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do usuario.' })
  userId!: string;

  @ApiPropertyOptional({
    example: 'Filha',
    maxLength: 40,
    nullable: true,
    type: String,
    description: 'Tipo de vinculo em texto livre.',
  })
  @IsOptional()
  @PatientText('O tipo de vinculo', 40)
  linkType?: string | null;

  @ApiPropertyOptional({
    example: 'Visita o paciente as tercas',
    maxLength: 500,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @PatientText('A observacao', 500)
  note?: string | null;
}
