import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class InspectInvitationDto {
  @ApiProperty({
    description:
      'Token do link do convite (parametro `token` da URL da pagina de aceite). Vai no corpo, nunca na URL da API.',
    maxLength: 512,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;
}

export class InvitationUserDto {
  @ApiProperty({ example: 'Ana Exemplo' })
  name!: string;

  @ApiProperty({ example: 'ana@example.test' })
  email!: string;
}

export class InvitationOrganizationDto {
  @ApiProperty({
    example: 'clinica-exemplo',
    description: 'Codigo usado no login.',
  })
  code!: string;

  @ApiProperty({ example: 'Clinica Exemplo', description: 'Nome fantasia.' })
  name!: string;
}

export class InvitationProfileDto {
  @ApiProperty({
    enum: ['admin', 'professional', 'caregiver', 'family'],
    example: 'caregiver',
  })
  code!: string;

  @ApiProperty({ example: 'Cuidador' })
  name!: string;
}

export class InvitationPreviewDto {
  @ApiProperty({ type: InvitationUserDto })
  user!: InvitationUserDto;

  @ApiProperty({ type: InvitationOrganizationDto })
  organization!: InvitationOrganizationDto;

  @ApiProperty({ type: InvitationProfileDto })
  profile!: InvitationProfileDto;

  @ApiProperty({
    format: 'date-time',
    description: 'Fim da validade do link.',
  })
  expiresAt!: string;
}
