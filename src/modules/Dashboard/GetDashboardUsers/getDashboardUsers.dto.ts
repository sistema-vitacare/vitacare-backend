import { ApiProperty } from '@nestjs/swagger';

import { TENANT_PROFILE_CODES } from '@/modules/Access/access.permissions';

export class DashboardProfileRefDto {
  @ApiProperty({ enum: [...TENANT_PROFILE_CODES], example: 'caregiver' })
  code!: string;

  @ApiProperty({ example: 'Cuidador' })
  name!: string;
}

export class DashboardUsersByProfileDto {
  @ApiProperty({ type: DashboardProfileRefDto })
  profile!: DashboardProfileRefDto;

  @ApiProperty({ minimum: 0, example: 12 })
  active!: number;

  @ApiProperty({
    minimum: 0,
    example: 1,
    description: 'Convidados que ainda nao fizeram o primeiro acesso.',
  })
  pending!: number;

  @ApiProperty({ minimum: 0, example: 2 })
  inactive!: number;
}

/** Detalhe do indicador de usuarios (UC05 passo 4); foto de agora, sem periodo. */
export class DashboardUsersDto {
  @ApiProperty({
    minimum: 0,
    example: 23,
    description: 'Usuarios com status active.',
  })
  active!: number;

  @ApiProperty({ minimum: 0, example: 2 })
  pending!: number;

  @ApiProperty({ minimum: 0, example: 4 })
  inactive!: number;

  @ApiProperty({
    type: [DashboardUsersByProfileDto],
    description:
      'Os quatro perfis da organizacao, sempre presentes: admin, professional, caregiver, family.',
  })
  byProfile!: DashboardUsersByProfileDto[];
}
