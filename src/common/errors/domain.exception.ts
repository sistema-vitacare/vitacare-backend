import { HttpException } from '@nestjs/common';
import type { DomainErrorPayload, FieldError } from './domainError.type';

/**
 * Unica excecao lancada por regra de negocio. O filtro global a converte no
 * contrato `{ error: { code, message, detail, fields }, meta }`.
 */
export class DomainException extends HttpException {
  readonly code: string;
  readonly detail: string | null;
  readonly fields: FieldError[] | null;

  constructor(payload: DomainErrorPayload) {
    super(
      { code: payload.code, message: payload.message },
      payload.status,
      payload.cause === undefined ? undefined : { cause: payload.cause },
    );

    this.code = payload.code;
    this.detail = payload.detail ?? null;
    this.fields = payload.fields ?? null;
  }
}
