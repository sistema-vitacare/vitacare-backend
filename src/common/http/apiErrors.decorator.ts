import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './envelope.dto';

export interface ApiErrorGroup {
  status: number;
  /** Codigos do catalogo do modulo que podem sair neste status. */
  codes: string[];
  description?: string;
}

/**
 * Documenta os erros possiveis da rota, agrupados por status. Os codigos vem do
 * catalogo `<modulo>.errors.ts`; nao inventar codigo no local de uso.
 */
export const ApiErrors = (...groups: ApiErrorGroup[]) =>
  applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...groups.map((group) =>
      ApiResponse({
        status: group.status,
        type: ErrorResponseDto,
        description:
          group.description ?? `Codigos possiveis: ${group.codes.join(', ')}`,
      }),
    ),
  );
