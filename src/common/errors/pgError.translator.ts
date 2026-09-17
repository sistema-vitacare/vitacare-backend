import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

interface PostgresError {
  code: string;
  constraint?: string;
}

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

/** `ux_patients_org_document` -> texto seguro. Sem valor de coluna. */
const constraintOf = (error: PostgresError): string =>
  error.constraint ?? 'sem constraint identificada';

/**
 * Converte erro do driver em `DomainException`. Devolve o erro original quando
 * o codigo nao e mapeado, para o filtro global tratar como 500.
 *
 * O `detail` do driver carrega o valor que violou a restricao
 * (`Key (email)=(ana@example.com)`) e por isso nunca e propagado: so o nome da
 * constraint entra na resposta.
 */
export const translatePgError = (error: unknown, resource: string): unknown => {
  if (!isPostgresError(error)) {
    return error;
  }

  const prefix = resource.toUpperCase();

  switch (error.code) {
    case '23505':
      return new DomainException({
        code: `${prefix}_DUPLICATE`,
        status: HttpStatus.CONFLICT,
        message: 'Ja existe um registro com estes dados.',
        detail: `Violacao de unicidade na constraint ${constraintOf(error)}.`,
        cause: error,
      });

    case '23503':
      return new DomainException({
        code: `${prefix}_FK_VIOLATION`,
        status: HttpStatus.CONFLICT,
        message: 'Registro relacionado inexistente ou em uso.',
        detail: `Violacao de chave estrangeira na constraint ${constraintOf(error)}.`,
        cause: error,
      });

    case '23514':
      return new DomainException({
        code: `${prefix}_CHECK_VIOLATION`,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Valor fora do conjunto permitido.',
        detail: `Violacao de CHECK na constraint ${constraintOf(error)}.`,
        cause: error,
      });

    default:
      return error;
  }
};
