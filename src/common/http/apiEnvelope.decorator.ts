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

/**
 * Documenta a resposta de sucesso ja envelopada em `{ data, meta }`. Usar em
 * toda rota: sem isto o OpenAPI mostra o DTO nu e diverge do comportamento
 * real da API.
 */
export const ApiEnvelope = <TModel extends Type<unknown>>(
  model: TModel,
  options: ApiEnvelopeOptions = {},
) =>
  applyDecorators(
    ApiExtraModels(model, ResponseMetaDto, PaginationMetaDto, ErrorResponseDto),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description,
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: options.isArray
            ? { type: 'array', items: { $ref: getSchemaPath(model) } }
            : { $ref: getSchemaPath(model) },
          meta: { $ref: getSchemaPath(ResponseMetaDto) },
        },
      },
    }),
  );
