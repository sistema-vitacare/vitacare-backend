import { DomainException } from '@/common/errors/domain.exception';

import { PermissionsGuard } from './permissions.guard';

const contextFor = (permissions?: string[]) =>
  ({
    switchToHttp: () => ({
      getRequest: () =>
        permissions
          ? { context: { permissions: new Set(permissions) } }
          : { context: undefined },
    }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  }) as never;

const guardRequiring = (required: string[]): PermissionsGuard =>
  new PermissionsGuard({
    getAllAndMerge: jest.fn().mockReturnValue(required),
  } as never);

describe('PermissionsGuard', () => {
  it('libera rota que nao declara permissao', () => {
    expect(guardRequiring([]).canActivate(contextFor([]))).toBe(true);
  });

  it('libera sessao que tem todas as permissoes exigidas', () => {
    const guard = guardRequiring(['users:reset_password']);

    expect(
      guard.canActivate(contextFor(['users:reset_password', 'patients:read'])),
    ).toBe(true);
  });

  it('recusa sessao que tem apenas parte das permissoes', () => {
    const guard = guardRequiring(['users:reset_password', 'users:write']);

    expect(() =>
      guard.canActivate(contextFor(['users:reset_password'])),
    ).toThrow(
      expect.objectContaining({ code: 'AUTH_FORBIDDEN' }) as DomainException,
    );
  });

  it('recusa requisicao sem contexto autenticado', () => {
    const guard = guardRequiring(['users:reset_password']);

    expect(() => guard.canActivate(contextFor())).toThrow(DomainException);
  });
});
