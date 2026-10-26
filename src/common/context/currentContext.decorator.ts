import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { RequestContext } from './requestContext.type';

interface RequestWithContext {
  context?: Partial<RequestContext>;
}

/**
 * Extrai o contexto que o guard de autenticacao anexou a requisicao.
 * Separado do decorator para ser testavel sem subir o Nest.
 */
export const contextFromRequest = (request: unknown): RequestContext => {
  const candidate = (request as RequestWithContext | null)?.context;

  if (!candidate?.organizationId || !candidate.userId) {
    throw new UnauthorizedException(
      'Requisicao sem contexto autenticado valido.',
    );
  }

  return candidate as RequestContext;
};

export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext =>
    contextFromRequest(ctx.switchToHttp().getRequest()),
);
