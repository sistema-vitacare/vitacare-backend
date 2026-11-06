import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { PaginationQueryDto } from '@/common/dto/paginationQuery.dto';
import { IsCalendarDate } from '@/common/validation/isCalendarDate.decorator';
import { PatientText } from '@/modules/Patient/dtos/patientFields';
import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  FOLLOW_UP_STATUSES,
  type FollowUpStatus,
} from '../types/followUp.types';

/** Filtros do historico (UC12, RF010), todos combinados com E. */
export class ListFollowUpsQueryDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Paciente dos registros.' })
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId!: string;

  @ApiPropertyOptional({
    enum: [...FOLLOW_UP_STATUSES],
    description: 'Omitido lista validos e anulados.',
  })
  @IsOptional()
  @IsIn(FOLLOW_UP_STATUSES, { message: 'O status deve ser valid ou annulled.' })
  status?: FollowUpStatus;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-11-01',
    description:
      'Primeiro dia do periodo, inclusivo, pela data da visita no fuso America/Sao_Paulo.',
  })
  @IsOptional()
  @IsCalendarDate(
    {},
    { message: 'Informe a data inicial no formato AAAA-MM-DD.' },
  )
  from?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-11-06',
    description:
      'Ultimo dia do periodo, inclusivo, pela data da visita no fuso America/Sao_Paulo. Nao anterior a from.',
  })
  @IsOptional()
  @IsCalendarDate(
    { notBefore: 'from' },
    {
      message:
        'Informe a data final no formato AAAA-MM-DD, igual ou posterior a inicial.',
    },
  )
  to?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Tipo de formulario: so registros que responderam este formulario.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do formulario.' })
  formId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Responsavel: so registros deste autor.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do responsavel.' })
  authorUserId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Parametro: so registros com resposta neste campo (fieldKey, identidade do campo atraves das versoes). As respostas do registro saem completas.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do parametro.' })
  fieldKey?: string;

  @ApiPropertyOptional({
    maxLength: 60,
    example: 'Sinais vitais',
    description:
      'Categoria de informacao: so registros com resposta em campo desta secao, sem diferenciar maiusculas. As respostas do registro saem completas.',
  })
  @IsOptional()
  @PatientText('A secao', 60)
  section?: string;
}
