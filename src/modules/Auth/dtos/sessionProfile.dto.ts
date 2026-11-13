import { ApiProperty } from '@nestjs/swagger';

import { ProfileCode } from '@/common/context/requestContext.type';
import {
  PLAN_FEATURES,
  PLAN_TERM_STATUSES,
} from '@/modules/Plan/types/plan.types';

export class SessionUserDto {
  @ApiProperty({
    format: 'uuid',
    example: '8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b',
  })
  id!: string;

  @ApiProperty({ example: 'Ana Exemplo', maxLength: 180 })
  name!: string;

  @ApiProperty({
    example: 'ana@example.test',
    maxLength: 254,
    description: 'E-mail de acesso, em minusculas.',
  })
  email!: string;

  @ApiProperty({
    example: '***.982.247-**',
    description:
      'CPF do proprio usuario. No login sai mascarado (`***.982.247-**`); em `/profile`, completo, com 11 digitos.',
  })
  cpf!: string;

  @ApiProperty({ example: '(11) 99999-0000', nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({
    enum: ['pending', 'active'],
    example: 'active',
    description:
      '`pending` so aparece no login da sessao restrita do primeiro acesso.',
  })
  status!: 'pending' | 'active' | 'inactive';

  @ApiProperty({ format: 'date-time', description: 'Data do cadastro.' })
  createdAt!: string;
}

export class SessionProfileRefDto {
  @ApiProperty({
    enum: Object.values(ProfileCode),
    example: 'professional',
    description:
      'Perfil de acesso; `platform_admin` e o administrador master da plataforma.',
  })
  code!: ProfileCode;

  @ApiProperty({ example: 'Profissional de saude' })
  name!: string;
}

export class SessionPlanDto {
  @ApiProperty({ example: 'enterprise' })
  code!: string;

  @ApiProperty({ example: 'Enterprise' })
  name!: string;

  @ApiProperty({
    enum: [...PLAN_FEATURES],
    isArray: true,
    example: ['patient_management', 'operational_dashboard'],
    description:
      'Recursos do plano (Quadro 2). Sem `operational_dashboard`, o painel responde 403; sem `management_reports`, os relatorios gerenciais tambem.',
  })
  features!: string[];

  @ApiProperty({
    enum: [...PLAN_TERM_STATUSES],
    example: 'active',
    description: '`expired` bloqueia novos cadastros, nunca a leitura.',
  })
  termStatus!: (typeof PLAN_TERM_STATUSES)[number];
}

export class SessionOrganizationDto {
  @ApiProperty({
    format: 'uuid',
    example: '3c9e1b7a-5d2f-4e8a-9b6c-7d1e2f3a4b5c',
  })
  id!: string;

  @ApiProperty({
    example: 'clinica-exemplo',
    description: 'Mesmo `organizationCode` usado no login.',
  })
  code!: string;

  @ApiProperty({ example: 'Clinica Exemplo', description: 'Nome fantasia.' })
  name!: string;

  @ApiProperty({
    example: 'Clinica Exemplo Ltda',
    nullable: true,
    type: String,
    description: 'Razao social.',
  })
  legalName!: string | null;

  @ApiProperty({
    enum: ['tenant', 'platform'],
    example: 'tenant',
    description: '`platform` e a organizacao dos administradores master.',
  })
  kind!: 'tenant' | 'platform';

  @ApiProperty({ enum: ['active', 'inactive'], example: 'active' })
  status!: 'active' | 'inactive';

  @ApiProperty({
    type: SessionPlanDto,
    nullable: true,
    description: '`null` na organizacao de plataforma, que nao tem plano.',
  })
  plan!: SessionPlanDto | null;
}

/**
 * Sessao do usuario (BE-27): o mesmo formato no login e em `/profile`, para o
 * frontend montar menus e redirecionar por perfil.
 */
export class SessionTermsDto {
  @ApiProperty({
    example: true,
    description:
      '`true` quando o usuario ainda nao aceitou a versao vigente do termo de uso: so le a propria sessao, aceita o termo e sai; o resto responde `403 TERMS_ACCEPTANCE_REQUIRED`.',
  })
  required!: boolean;

  @ApiProperty({
    example: 1,
    nullable: true,
    type: Number,
    description:
      'Versao vigente (a maior publicada); `null` sem nenhuma versao.',
  })
  currentVersion!: number | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Number,
    description: 'Maior versao ja aceita pelo usuario; `null` sem aceite.',
  })
  acceptedVersion!: number | null;
}

export class SessionProfileDto {
  @ApiProperty({ type: SessionUserDto })
  user!: SessionUserDto;

  @ApiProperty({ type: SessionProfileRefDto })
  profile!: SessionProfileRefDto;

  @ApiProperty({
    type: String,
    isArray: true,
    example: ['alerts:read', 'patients:read', 'profile:manage'],
    description:
      'Permissoes efetivas da sessao, em ordem alfabetica; as mesmas que a API aplica. Vazia na sessao restrita do primeiro acesso e enquanto o termo de uso vigente nao for aceito (`terms.required`).',
  })
  permissions!: string[];

  @ApiProperty({ type: SessionOrganizationDto })
  organization!: SessionOrganizationDto;

  @ApiProperty({
    type: SessionTermsDto,
    description: 'Situacao do aceite do termo de uso (BE-32).',
  })
  terms!: SessionTermsDto;
}
