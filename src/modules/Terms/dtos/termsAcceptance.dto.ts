import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PickType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { GetPatientEvolutionQueryDto } from '@/modules/Indicator/GetPatientEvolution/getPatientEvolution.dto';

const VERSION_DESCRIPTION = 'Numero da versao do termo.';
const HASH_EXAMPLE =
  'd11270af9e3bfc0817118586325d9cc26444dd4e4a1cb7937cdbc754f807c641';

export class AcceptTermsDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
    description:
      'Versao que o usuario leu (a de `GET /terms/current`). Precisa ser a vigente.',
  })
  @Type(() => Number)
  @IsInt({ message: 'Informe a versao do termo como numero inteiro.' })
  @Min(1, { message: 'A versao do termo comeca em 1.' })
  @Max(999999, { message: 'Versao do termo invalida.' })
  version!: number;
}

export class OwnTermsAcceptanceDto {
  @ApiProperty({ example: 1, description: VERSION_DESCRIPTION })
  version!: number;

  @ApiProperty({
    example: HASH_EXAMPLE,
    description: 'SHA-256 do texto aceito.',
  })
  contentHash!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Hora do servidor no aceite.',
  })
  acceptedAt!: string;
}

export class TermsAcceptanceDto extends OwnTermsAcceptanceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: false,
    description:
      '`true` quando esta versao ja tinha sido aceita: nada novo e gravado e volta o aceite original.',
  })
  alreadyAccepted!: boolean;
}

export class TermsAcceptanceRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'Nome Exemplo',
    description:
      'Nome da organizacao ou do usuario. Para o master, o nome de usuario de outra organizacao sai mascarado ("P**** L***").',
  })
  name!: string;
}

export class TermsAcceptanceItemDto extends OwnTermsAcceptanceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: TermsAcceptanceRefDto })
  organization!: TermsAcceptanceRefDto;

  @ApiProperty({ type: TermsAcceptanceRefDto })
  user!: TermsAcceptanceRefDto;

  @ApiProperty({
    example: 'admin',
    description: 'Perfil do usuario no instante do aceite.',
  })
  profileCode!: string;

  @ApiProperty({
    example: '203.0.113.10',
    nullable: true,
    type: String,
    description:
      'IP do cliente pela regra `TRUST_PROXY`; nulo quando nao foi possivel identificar.',
  })
  ipAddress!: string | null;

  @ApiProperty({
    example: 'Mozilla/5.0 (X11; Linux x86_64)',
    nullable: true,
    type: String,
    maxLength: 512,
    description: 'Navegador informado, sem caracteres de controle, ate 512.',
  })
  userAgent!: string | null;

  @ApiProperty({
    example: '6f1c2b1e-8d1a-4c3e-9b7a-1f2e3d4c5b6a',
    nullable: true,
    type: String,
    description: 'Mesmo `meta.requestId` da requisicao do aceite.',
  })
  requestId!: string | null;
}

export class TermsAcceptanceFilterQueryDto extends PickType(
  GetPatientEvolutionQueryDto,
  ['from', 'to'] as const,
) {
  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: VERSION_DESCRIPTION,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Informe a versao do termo como numero inteiro.' })
  @Min(1, { message: 'A versao do termo comeca em 1.' })
  @Max(999999, { message: 'Versao do termo invalida.' })
  version?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuario que aceitou.' })
  @IsOptional()
  @IsUUID('all', { message: 'Informe o identificador do usuario.' })
  userId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Filtra por organizacao; so o master usa (sem ele, todas). No tenant e ignorado: vale a organizacao da sessao.',
  })
  @IsOptional()
  @IsUUID('all', { message: 'Informe o identificador da organizacao.' })
  organizationId?: string;
}

export class ListTermsAcceptancesQueryDto extends IntersectionType(
  TermsAcceptanceFilterQueryDto,
  PaginationQueryDto,
) {}
