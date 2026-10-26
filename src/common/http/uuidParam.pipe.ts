import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { CommonErrors } from '../errors/commonErrors';
import { DomainException } from '../errors/domain.exception';

/**
 * Valida um identificador de rota mantendo o mesmo contrato de erro do
 * `ValidationPipe`: campo invalido responde `422 VALIDATION_FAILED` com o nome
 * do parametro em `fields`, e nao o `400` cru do pipe padrao do Nest.
 */
export const UuidParam = (field: string): ParseUUIDPipe =>
  new ParseUUIDPipe({
    exceptionFactory: () =>
      new DomainException({
        code: CommonErrors.VALIDATION_FAILED,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Alguns campos precisam ser corrigidos.',
        detail: '1 campo invalido na requisicao.',
        fields: [
          {
            field,
            code: 'IS_UUID',
            message: 'Informe um identificador UUID valido.',
          },
        ],
      }),
  });
