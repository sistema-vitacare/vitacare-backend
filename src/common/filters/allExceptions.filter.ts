import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { CommonErrors } from '../errors/commonErrors';
import { DomainException } from '../errors/domain.exception';
import type { FieldError } from '../errors/domainError.type';
import { isExcludedPath } from '../http/excludedPaths';
import { resolveRequestId } from '../http/requestId';

interface ErrorBody {
  code: string;
  message: string;
  detail: string | null;
  fields: FieldError[] | null;
}

interface RequestLike {
  url: string;
  path?: string;
  method: string;
  id?: string | number;
}

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: CommonErrors.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: CommonErrors.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: CommonErrors.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: CommonErrors.NOT_FOUND,
  [HttpStatus.CONFLICT]: CommonErrors.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: CommonErrors.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: CommonErrors.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: CommonErrors.SERVICE_UNAVAILABLE,
};

const GENERIC_MESSAGE =
  'Nao foi possivel concluir a operacao. Tente novamente.';

// Comparar faixa de status exige numero puro, nao membro de enum.
const CLIENT_ERROR_THRESHOLD: number = HttpStatus.BAD_REQUEST;
const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** Extrai a mensagem de uma HttpException do proprio Nest. */
const nestMessage = (exception: HttpException): string => {
  const payload = exception.getResponse();

  if (typeof payload === 'string') {
    return payload;
  }

  const raw = (payload as { message?: unknown }).message;

  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).join('; ');
  }

  return typeof raw === 'string' ? raw : exception.message;
};

/**
 * Normaliza toda saida de erro da API em `{ error, meta }`. Excecao que nao e
 * HttpException vira 500 generico: a causa vai para o log, nunca para a
 * resposta HTTP. As rotas excluidas mantem o corpo original, porque o relatorio
 * do Terminus e o contrato de health.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly excludedPaths: readonly string[] = []) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestLike>();
    const response = ctx.getResponse<Response>();

    const status = this.statusOf(exception);
    const requestId = resolveRequestId(request);
    const path = request.path ?? request.url;

    this.log(status, request, exception, requestId);

    if (isExcludedPath(path, this.excludedPaths)) {
      response
        .status(status)
        .json(this.legacyBody(exception, status, request, requestId));
      return;
    }

    response.status(status).json({
      error: this.describe(exception, status),
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        status,
      },
    });
  }

  private statusOf(exception: unknown): number {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private describe(exception: unknown, status: number): ErrorBody {
    if (exception instanceof DomainException) {
      return {
        code: exception.code,
        message: nestMessage(exception),
        detail: exception.detail,
        fields: exception.fields,
      };
    }

    if (exception instanceof HttpException) {
      return {
        code: CODE_BY_STATUS[status] ?? CommonErrors.INTERNAL_ERROR,
        message: nestMessage(exception),
        detail: null,
        fields: null,
      };
    }

    return {
      code: CommonErrors.INTERNAL_ERROR,
      message: GENERIC_MESSAGE,
      detail: null,
      fields: null,
    };
  }

  /**
   * Formato anterior, mantido nas rotas excluidas para nao alterar a semantica
   * de `/health/ready`, que responde com o relatorio de dependencias.
   */
  private legacyBody(
    exception: unknown,
    status: number,
    request: RequestLike,
    requestId: string,
  ): Record<string, unknown> {
    const base: Record<string, unknown> =
      exception instanceof HttpException
        ? this.legacyHttpBody(exception, status)
        : {
            statusCode: status,
            error: 'Internal Server Error',
            message: GENERIC_MESSAGE,
          };

    return {
      ...base,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }

  private legacyHttpBody(
    exception: HttpException,
    status: number,
  ): Record<string, unknown> {
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { statusCode: status, error: exception.name, message: payload };
    }

    const record = payload as Record<string, unknown>;

    // Payload customizado, como o relatorio do Terminus, chega intacto.
    if (!('message' in record)) {
      return { ...record, statusCode: status };
    }

    return {
      statusCode: status,
      error: typeof record.error === 'string' ? record.error : exception.name,
      message: record.message,
    };
  }

  private log(
    status: number,
    request: RequestLike,
    exception: unknown,
    requestId: string,
  ): void {
    const line = `${request.method} ${request.url} -> ${status} [${requestId}]`;

    if (status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        line,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    if (status >= CLIENT_ERROR_THRESHOLD) {
      const code =
        exception instanceof DomainException ? exception.code : 'HTTP_ERROR';
      this.logger.warn(`${line} ${code}`);
    }
  }
}
