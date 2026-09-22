import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import {
  ErrorResponseDto,
  PaginationMetaDto,
  ResponseMetaDto,
} from './envelope.dto';

export interface ApiEnvelopeOptions {
  status?: number;
  isArray?: boolean;
  description?: string;
}

/** Rota que responde apenas efeito, sem corpo de dados: `data` sai como `null`. */
const NULL_DATA_SCHEMA = {
  nullable: true,
  description: 'Operacao sem corpo de dados: `data` e sempre `null`.',
  example: null,
};

/**
 * Documenta a resposta de sucesso ja envelopada em `{ data, meta }`. Usar em
 * toda rota: sem isto o OpenAPI mostra o DTO nu e diverge do comportamento
 * real da API.
 *
 * Passar `null` como modelo documenta a rota que responde `data: null`, em vez
 * de reaproveitar um DTO de entrada como se fosse resposta.
 */
export const ApiEnvelope = <TModel extends Type<unknown>>(
  model: TModel | null,
  options: ApiEnvelopeOptions = {},
) => {
  const dataSchema = model
    ? options.isArray
      ? { type: 'array' as const, items: { $ref: getSchemaPath(model) } }
      : { $ref: getSchemaPath(model) }
    : NULL_DATA_SCHEMA;

  const models = model
    ? [model, ResponseMetaDto, PaginationMetaDto, ErrorResponseDto]
    : [ResponseMetaDto, PaginationMetaDto, ErrorResponseDto];

  return applyDecorators(
    ApiExtraModels(...models),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description,
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: dataSchema,
          meta: { $ref: getSchemaPath(ResponseMetaDto) },
        },
      },
    }),
  );
};
