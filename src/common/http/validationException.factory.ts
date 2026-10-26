import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { CommonErrors } from '../errors/commonErrors';
import { DomainException } from '../errors/domain.exception';
import type { FieldError } from '../errors/domainError.type';

/** `isEmail` -> `IS_EMAIL`, para o codigo por campo ser estavel e legivel. */
const toFieldCode = (constraint: string): string =>
  constraint.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/** Achata erros aninhados em `pai.filho`, preservando a ordem de declaracao. */
const flatten = (errors: ValidationError[], parent = ''): FieldError[] =>
  errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;

    const own = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]): FieldError => ({
        field,
        code: toFieldCode(constraint),
        message,
      }),
    );

    return [...own, ...flatten(error.children ?? [], field)];
  });

/**
 * Substitui o erro padrao do ValidationPipe. O status passa de 400 para 422:
 * o JSON esta correto, os valores e que nao estao.
 *
 * A mensagem por campo vem do class-validator, entao todo DTO deve declarar
 * `message` em portugues nas suas restricoes.
 */
export const validationExceptionFactory = (
  errors: ValidationError[],
): DomainException => {
  const fields = flatten(errors);

  return new DomainException({
    code: CommonErrors.VALIDATION_FAILED,
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Alguns campos precisam ser corrigidos.',
    detail: `${fields.length} ${fields.length === 1 ? 'campo invalido' : 'campos invalidos'} na requisicao.`,
    fields,
  });
};
