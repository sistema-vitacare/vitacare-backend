import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '../auth.errors';
import type { AuthenticatedRequest } from '../types/authenticatedRequest.type';
import { REQUIRED_PERMISSIONS_KEY } from './requiredPermissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndMerge<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required.length === 0) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      required.every((permission) =>
        request.context?.permissions.has(permission),
      )
    )
      return true;
    throw new DomainException({
      ...AuthErrors.FORBIDDEN,
      detail: 'Permissão necessária não concedida à sessão.',
    });
  }
}
