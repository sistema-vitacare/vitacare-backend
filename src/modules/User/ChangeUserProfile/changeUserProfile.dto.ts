import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import {
  TENANT_PROFILE_CODES,
  type TenantProfileCode,
} from '@/modules/Access/access.permissions';

export class ChangeUserProfileDto {
  @ApiProperty({
    enum: [...TENANT_PROFILE_CODES],
    example: 'professional',
    description:
      'Codigo do novo perfil do usuario na organizacao. `platform_admin` nao e aceito.',
  })
  @IsIn(TENANT_PROFILE_CODES, {
    message: 'O perfil deve ser admin, professional, caregiver ou family.',
  })
  profileCode!: TenantProfileCode;
}

export class UserProfileRefDto {
  @ApiProperty({ example: 'professional', description: 'Codigo do perfil.' })
  code!: string;

  @ApiProperty({
    example: 'Profissional de saude',
    description: 'Nome do perfil para exibicao.',
  })
  name!: string;
}

export class ChangeUserProfileResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b',
    description: 'Identificador do usuario alvo.',
  })
  id!: string;

  @ApiProperty({ example: 'Ana Exemplo', description: 'Nome do usuario.' })
  name!: string;

  @ApiProperty({
    type: UserProfileRefDto,
    description: 'Perfil vigente do usuario depois da operacao.',
  })
  profile!: UserProfileRefDto;
}
