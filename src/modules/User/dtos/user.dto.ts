import { ApiProperty } from '@nestjs/swagger';

import { TENANT_PROFILE_CODES } from '@/modules/Access/access.permissions';

export const USER_STATUSES = ['pending', 'active', 'inactive'] as const;

export class UserProfileRefDto {
  @ApiProperty({
    enum: [...TENANT_PROFILE_CODES],
    example: 'professional',
    description: 'Codigo do perfil.',
  })
  code!: string;

  @ApiProperty({
    example: 'Profissional de saude',
    description: 'Nome do perfil para exibicao.',
  })
  name!: string;
}

export class UserInvitationDto {
  @ApiProperty({
    enum: ['pending', 'expired'],
    example: 'pending',
    description:
      '`pending` enquanto a senha provisoria vale; `expired` depois do prazo (reemitir o convite).',
  })
  status!: 'pending' | 'expired';

  @ApiProperty({
    format: 'date-time',
    description: 'Fim da validade da senha provisoria do convite.',
  })
  expiresAt!: string;
}

export class UserDto {
  @ApiProperty({
    format: 'uuid',
    example: '8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b',
  })
  id!: string;

  @ApiProperty({ example: 'Ana Exemplo', maxLength: 180 })
  name!: string;

  @ApiProperty({ example: 'ana@example.test', maxLength: 254 })
  email!: string;

  @ApiProperty({
    example: '52998224725',
    description:
      'CPF com 11 digitos. Na listagem sai mascarado (`***.982.247-**`).',
  })
  cpf!: string;

  @ApiProperty({ example: '(11) 99999-0000', nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({
    enum: [...USER_STATUSES],
    example: 'active',
    description:
      '`pending`: convidado que ainda nao concluiu o primeiro acesso; `active`; `inactive`: acesso revogado.',
  })
  status!: (typeof USER_STATUSES)[number];

  @ApiProperty({ type: UserProfileRefDto })
  profile!: UserProfileRefDto;

  @ApiProperty({
    type: UserInvitationDto,
    nullable: true,
    description: 'Situacao do convite; `null` quando o status nao e `pending`.',
  })
  invitation!: UserInvitationDto | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastAccessAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description: 'Momento da inativacao; `null` enquanto pendente ou ativo.',
  })
  deletedAt!: string | null;
}

export class UserInvitationResponseDto {
  @ApiProperty({
    example: 'Kq7mTz3pW9xYb2nHc4Rd',
    description:
      'Senha provisoria do convite, exibida uma unica vez. Entregar ao usuario fora da API.',
  })
  temporaryPassword!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Fim da validade da senha provisoria (emissao + 24 h).',
  })
  expiresAt!: string;
}
