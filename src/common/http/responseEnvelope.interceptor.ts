import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { buildEnvelope } from './envelope';
import { isExcludedPath } from './excludedPaths';
import { resolveRequestId } from './requestId';

/**
 * Envelopa toda resposta de sucesso em `{ data, meta }`. As rotas listadas em
 * `excludedPaths` passam intactas: health mantem o formato do Terminus e a
 * documentacao mantem HTML e OpenAPI puros.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly excludedPaths: readonly string[]) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<{ path?: string; url?: string }>();

    const path = request.path ?? request.url ?? '';

    if (isExcludedPath(path, this.excludedPaths)) {
      return next.handle();
    }

    const requestId = resolveRequestId(request);

    return next
      .handle()
      .pipe(map((result) => buildEnvelope(result, requestId)));
  }
}
