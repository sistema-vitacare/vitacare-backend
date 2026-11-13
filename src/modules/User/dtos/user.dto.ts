import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TENANT_PROFILE_CODES } from '@/modules/Access/access.permissions';

import {
  INVITATION_CHANNELS,
  type InvitationChannel,
} from '../types/user.types';

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

export const INVITATION_STATUSES = [
  'pending',
  'expired',
  'invalidated',
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export class UserInvitationDto {
  @ApiProperty({
    enum: [...INVITATION_CHANNELS],
    example: 'email',
    description:
      '`email`: link enviado ao usuario para ele cadastrar a senha; `temporary_password`: senha provisoria entregue pelo administrador.',
  })
  channel!: InvitationChannel;

  @ApiProperty({
    enum: [...INVITATION_STATUSES],
    example: 'pending',
    description:
      '`pending` enquanto o convite vale; `expired` depois do prazo; `invalidated` (so `email`) quando o link foi revogado: envio falhou ou o e-mail do usuario mudou. Em `expired` e `invalidated`, reemitir o convite.',
  })
  status!: InvitationStatus;

  @ApiProperty({
    format: 'date-time',
    description:
      'Fim da validade do convite: da senha provisoria (24 h) ou do link (padrao 72 h).',
  })
  expiresAt!: string;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description:
      'Quando o servidor SMTP aceitou o e-mail do convite; `null` no canal `temporary_password` ou se o envio nao saiu. Aceito pelo SMTP nao quer dizer entregue na caixa.',
  })
  sentAt!: string | null;
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

export class InvitationDeliveryDto {
  @ApiProperty({
    enum: ['sent', 'failed'],
    example: 'sent',
    description:
      '`sent`: o servidor SMTP aceitou o e-mail; `failed`: o envio falhou e o link ja foi revogado (reemitir o convite ou usar a senha provisoria).',
  })
  status!: 'sent' | 'failed';
}

export class UserInvitationResponseDto {
  @ApiProperty({
    enum: [...INVITATION_CHANNELS],
    example: 'temporary_password',
    description: 'Canal usado neste convite.',
  })
  channel!: InvitationChannel;

  @ApiPropertyOptional({
    example: 'Kq7mTz3pW9xYb2nHc4Rd',
    description:
      'So no canal `temporary_password`: senha provisoria, exibida uma unica vez. Entregar ao usuario fora da API. Nunca aparece no canal `email`.',
  })
  temporaryPassword?: string;

  @ApiProperty({
    format: 'date-time',
    description:
      'Fim da validade do convite: senha provisoria (emissao + 24 h) ou link (emissao + `INVITATION_TTL_HOURS`, padrao 72 h).',
  })
  expiresAt!: string;

  @ApiPropertyOptional({
    type: InvitationDeliveryDto,
    description: 'So no canal `email`: resultado do envio.',
  })
  delivery?: InvitationDeliveryDto;
}
