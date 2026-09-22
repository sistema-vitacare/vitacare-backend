import { createHash } from 'node:crypto';

import { DomainException } from '@/common/errors/domain.exception';

import { AuthGuard } from './auth.guard';
import { ALLOWED_SESSION_TYPES_KEY, IS_PUBLIC_KEY } from './public.decorator';

const principal = {
  sessionId: 'sessao-1',
  sessionType: 'normal' as const,
  userId: 'user-1',
  organizationId: 'org-1',
  profile: 'admin' as never,
  permissions: new Set(['users:reset_password']),
  absoluteExpiresAt: new Date('2026-09-22T12:00:00.000Z'),
};

const contextFor = (request: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  }) as never;

const reflectorFor = (metadata: Record<string, unknown>) => ({
  getAllAndOverride: jest.fn((key: string) => metadata[key]),
});

describe('AuthGuard', () => {
  it('libera rota publica sem tocar no banco', async () => {
    const sessions = { resolve: jest.fn() };
    const guard = new AuthGuard(
      reflectorFor({ [IS_PUBLIC_KEY]: true }) as never,
      sessions as never,
    );

    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(
      true,
    );
    expect(sessions.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['sem header', {}],
    ['com esquema errado', { authorization: 'Basic abc' }],
    [
      'com token fora do alfabeto',
      { authorization: 'Bearer token com espaço' },
    ],
  ])('recusa requisicao %s', async (_case, headers) => {
    const guard = new AuthGuard(
      reflectorFor({}) as never,
      { resolve: jest.fn() } as never,
    );

    await expect(
      guard.canActivate(contextFor({ headers })),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_UNAUTHENTICATED',
    });
  });

  it('consulta a sessao pelo SHA-256 do token apresentado', async () => {
    const sessions = { resolve: jest.fn().mockResolvedValue(principal) };
    const guard = new AuthGuard(reflectorFor({}) as never, sessions as never);
    const request = { headers: { authorization: 'Bearer token-opaco' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(sessions.resolve).toHaveBeenCalledWith(
      createHash('sha256').update('token-opaco').digest('hex'),
      expect.any(Date),
    );
  });

  it('recusa sessao inexistente, expirada ou revogada', async () => {
    const guard = new AuthGuard(
      reflectorFor({}) as never,
      { resolve: jest.fn().mockResolvedValue(null) } as never,
    );

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer token-opaco' } }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_UNAUTHENTICATED',
    });
  });

  it('recusa sessao restrita em rota que exige sessao normal', async () => {
    const guard = new AuthGuard(
      reflectorFor({}) as never,
      {
        resolve: jest
          .fn()
          .mockResolvedValue({ ...principal, sessionType: 'password_change' }),
      } as never,
    );

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer token-opaco' } }),
      ),
    ).rejects.toMatchObject<Partial<DomainException>>({
      code: 'AUTH_UNAUTHENTICATED',
    });
  });

  it('aceita sessao restrita na rota que a declara', async () => {
    const guard = new AuthGuard(
      reflectorFor({
        [ALLOWED_SESSION_TYPES_KEY]: ['password_change'],
      }) as never,
      {
        resolve: jest
          .fn()
          .mockResolvedValue({ ...principal, sessionType: 'password_change' }),
      } as never,
    );

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer token-opaco' } }),
      ),
    ).resolves.toBe(true);
  });

  it('anexa o contexto derivado da sessao, e nao do corpo da requisicao', async () => {
    const guard = new AuthGuard(
      reflectorFor({}) as never,
      { resolve: jest.fn().mockResolvedValue(principal) } as never,
    );

    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer token-opaco', 'x-request-id': 'req-9' },
      body: { organizationId: 'org-invasora' },
    };

    await guard.canActivate(contextFor(request));

    expect(request.authSessionId).toBe('sessao-1');
    expect(request.context).toEqual({
      requestId: 'req-9',
      userId: 'user-1',
      organizationId: 'org-1',
      profile: 'admin',
      permissions: principal.permissions,
    });
  });
});
