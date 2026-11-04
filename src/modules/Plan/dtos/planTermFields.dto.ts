import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

const MAX_LIMIT = 100000;

/**
 * Vigencia e limites do termo que sera aberto. Ausente ou `null` = sem
 * vencimento / limite do catalogo: a atribuicao substitui o termo inteiro.
 */
export class PlanTermFieldsDto {
  @ApiPropertyOptional({
    format: 'date-time',
    nullable: true,
    description: 'Fim da vigencia (instante futuro, ISO 8601 com fuso).',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'Informe a data de fim em ISO 8601 com fuso.' },
  )
  endsAt?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: MAX_LIMIT })
  @IsOptional()
  @IsInt({ message: 'O limite de usuarios deve ser inteiro.' })
  @Min(0, { message: 'O limite de usuarios nao pode ser negativo.' })
  @Max(MAX_LIMIT, { message: `O limite de usuarios aceita ate ${MAX_LIMIT}.` })
  userLimit?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: MAX_LIMIT })
  @IsOptional()
  @IsInt({ message: 'O limite de pacientes deve ser inteiro.' })
  @Min(0, { message: 'O limite de pacientes nao pode ser negativo.' })
  @Max(MAX_LIMIT, { message: `O limite de pacientes aceita ate ${MAX_LIMIT}.` })
  patientLimit?: number | null;
}
