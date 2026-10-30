import { ApiProperty } from '@nestjs/swagger';

export class AccessProfilePermissionDto {
  @ApiProperty({
    example: 'patients:read',
    description: 'Codigo da permissao no formato `recurso:acao`.',
  })
  code!: string;

  @ApiProperty({
    example: 'Consultar pacientes',
    description: 'Rotulo da permissao para exibicao.',
  })
  name!: string;
}

export class AccessProfileDto {
  @ApiProperty({
    example: 'admin',
    description:
      'Codigo do perfil na organizacao (`admin`, `professional`, `caregiver`, `family`).',
  })
  code!: string;

  @ApiProperty({ example: 'Administrador', description: 'Nome do perfil.' })
  name!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Administrador da organizacao',
    description: 'Descricao do perfil, como gravada; `null` quando ausente.',
  })
  description!: string | null;

  @ApiProperty({
    type: [AccessProfilePermissionDto],
    description: 'Permissoes vigentes do perfil, ordenadas por codigo.',
  })
  permissions!: AccessProfilePermissionDto[];
}
