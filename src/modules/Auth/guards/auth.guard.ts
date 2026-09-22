import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';

import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import { AuthSessionRepository } from '../repositories/authSession.repository';
import type { AuthSessionType } from '../entities/authSession.entity';
import type { AuthenticatedRequest } from '../types/authenticatedRequest.type';
import { ALLOWED_SESSION_TYPES_KEY, IS_PUBLIC_KEY } from './public.decorator';

/** Token opaco em base64url; nada mais e aceito no header. */
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+)$/;

/**
 * Guard global: recompoe o contexto autenticado a cada requisicao a partir do
 * banco, nao do token. Revogacao, expiracao, inativacao de usuario e de
 * organizacao valem imediatamente na proxima chamada.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: AuthSessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER_PATTERN.exec(request.headers.authorization ?? '')?.[1];

    if (!token) {
      throw this.unauthenticated('Bearer ausente ou malformado.');
    }

    const principal = await this.sessions.resolve(
      createHash('sha256').update(token).digest('hex'),
      new Date(),
    );

    if (!principal) {
      throw this.unauthenticated('Sessão inválida, expirada ou revogada.');
    }

    if (!this.allowedTypes(context).includes(principal.sessionType)) {
      throw this.unauthenticated('Tipo de sessão incompatível com a operação.');
    }

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

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  /** Sem declaracao explicita, a rota exige sessao normal. */
  private allowedTypes(context: ExecutionContext): AuthSessionType[] {
    return (
      this.reflector.getAllAndOverride<AuthSessionType[]>(
        ALLOWED_SESSION_TYPES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? ['normal']
    );
  }

  private unauthenticated(detail: string): DomainException {
    return new DomainException({ ...AuthErrors.UNAUTHENTICATED, detail });
  }
}
