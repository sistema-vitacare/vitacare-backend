import type {
  PermissionCode,
  RequestContext,
} from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';

type PermissionSubject = Pick<RequestContext, 'permissions'> | undefined;

/** Contexto ausente nega: sem sessao nao ha permissao concedida. */
export const hasPermission = (
  ctx: PermissionSubject,
  code: PermissionCode,
): boolean => ctx?.permissions.has(code) ?? false;

export const assertPermission = (
  ctx: PermissionSubject,
  code: PermissionCode,
): void => {
  if (!hasPermission(ctx, code)) {
    throw new DomainException({
      ...AuthErrors.FORBIDDEN,
      detail: 'Permissão necessária não concedida à sessão.',
    });
  }
};

export const assertAnyPermission = (
  ctx: PermissionSubject,
  codes: readonly PermissionCode[],
): void => {
  if (!codes.some((code) => hasPermission(ctx, code))) {
    throw new DomainException({
      ...AuthErrors.FORBIDDEN,
      detail: 'Nenhuma das permissões aceitas foi concedida à sessão.',
    });
  }
};
