import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { assertPermission } from '@/modules/Access/policies/access.policy';

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
    required.forEach((code) => assertPermission(request.context, code));

    return true;
  }
}
