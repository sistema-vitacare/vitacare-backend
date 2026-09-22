import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '../auth.errors';
import { AuthSessionRepository } from '../repositories/authSession.repository';
import type { AuthenticatedRequest } from '../types/authenticatedRequest.type';
import { ALLOWED_SESSION_TYPES_KEY, IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: AuthSessionRepository,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorization ?? '');
    if (!match)
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Bearer ausente ou malformado.',
      });
    const principal = await this.sessions.resolve(
      createHash('sha256').update(match[1]).digest('hex'),
      new Date(),
    );
    if (!principal)
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Sessão inválida, expirada ou revogada.',
      });
    const types = this.reflector.getAllAndOverride<
      Array<'normal' | 'password_change'>
    >(ALLOWED_SESSION_TYPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? ['normal'];
    if (!types.includes(principal.sessionType))
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Tipo de sessão incompatível com a operação.',
      });
    request.authSessionId = principal.sessionId;
    request.context = {
      requestId: String(request.headers['x-request-id'] ?? ''),
      userId: principal.userId,
      organizationId: principal.organizationId,
      profile: principal.profile,
      permissions: principal.permissions,
    };
    return true;
  }
}
