import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import {
  normalizeIp,
  runWithRequestMetadata,
} from '../context/requestMetadata';

/**
 * Deixa o IP do cliente (regra `trust proxy`) disponivel para a auditoria
 * enquanto o handler roda, sem passar o IP por todos os casos de uso. Fica
 * depois do body parser, onde um middleware perderia o contexto assincrono.
 */
export class RequestMetadataInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const metadata = { ip: normalizeIp(request.ip) };

    return new Observable((subscriber) =>
      runWithRequestMetadata(metadata, () =>
        next.handle().subscribe(subscriber),
      ),
    );
  }
}
