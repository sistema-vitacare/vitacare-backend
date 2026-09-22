import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import type { AuthenticatedRequest } from '../types/authenticatedRequest.type';
import { REQUIRED_PERMISSIONS_KEY } from './requiredPermissions.decorator';

/**
 * Autorizacao por permissao nomeada. Roda depois do `AuthGuard`, sobre o
 * conjunto que veio da sessao; a rota precisa de todas as permissoes que
 * declarou.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndMerge<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const granted = request.context?.permissions;

    if (granted && required.every((permission) => granted.has(permission))) {
      return true;
    }

    throw new DomainException({
      ...AuthErrors.FORBIDDEN,
      detail: 'Permissão necessária não concedida à sessão.',
    });
  }
}
