import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({
    description: 'Token do link do convite.',
    maxLength: 512,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    description: 'Senha que o proprio usuario escolhe.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class AcceptedInvitationDto {
  @ApiProperty({
    example: 'clinica-exemplo',
    description: 'Codigo da organizacao, para preencher o login.',
  })
  organizationCode!: string;

  @ApiProperty({
    example: 'ana@example.test',
    description: 'E-mail do usuario, para preencher o login.',
  })
  email!: string;
}
