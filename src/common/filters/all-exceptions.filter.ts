import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

export interface ErrorResponseMetadata {
  path: string;
  method: string;
  timestamp: string;
  requestId?: string;
}

export type ErrorResponseBody = Record<string, unknown> & ErrorResponseMetadata;

/**
 * Normaliza toda saida de erro da API em um unico formato. Excecoes que nao sao
 * HttpException viram 500 generico: a causa vai para o log, nunca para a
 * resposta HTTP.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string | number }>();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.describe(exception);

    if (status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ErrorResponseBody = {
      ...body,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    if (request.id !== undefined) {
      payload.requestId = String(request.id);
    }

    response.status(status).json(payload);
  }

  private describe(exception: unknown): {
    status: number;
    body: Record<string, unknown>;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return {
          status,
          body: { statusCode: status, error: exception.name, message: payload },
        };
      }

      const record = payload as Record<string, unknown>;

      // Erros padrao do Nest (ValidationPipe, NotFound, ...) sempre trazem
      // `message`. Qualquer outro payload e customizado - como o relatorio de
      // dependencias do Terminus - e precisa chegar intacto ao cliente.
      if (!('message' in record)) {
        return { status, body: { ...record, statusCode: status } };
      }

      return {
        status,
        body: {
          statusCode: status,
          error:
            typeof record.error === 'string' ? record.error : exception.name,
          message: record.message,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Unexpected internal error',
      },
    };
  }
}
