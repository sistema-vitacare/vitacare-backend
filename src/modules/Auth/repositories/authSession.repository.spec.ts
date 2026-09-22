import { AuthSessionRepository } from './authSession.repository';

const config = {
  getOrThrow: jest.fn((key: string) =>
    key === 'auth.sessionIdleSeconds' ? 1800 : 0,
  ),
};

const sessionRow = {
  sessionId: 'sessao-1',
  sessionType: 'normal',
  userId: 'user-1',
  organizationId: 'org-1',
  absoluteExpiresAt: new Date('2026-09-22T12:00:00.000Z'),
  profileId: 'profile-1',
  profile: 'admin',
};

describe('AuthSessionRepository', () => {
  const now = new Date('2026-09-22T10:00:00.000Z');

  it('descarta a sessao parada alem da janela de inatividade', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new AuthSessionRepository(
      { query } as never,
      config as never,
    );

    await expect(repository.resolve('hash-token', now)).resolves.toBeNull();

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain('last_activity_at');
    expect(parameters).toEqual([
      'hash-token',
      now,
      new Date('2026-09-22T09:30:00.000Z'),
    ]);
  });

  it('renova a atividade e devolve o principal com as permissoes do perfil', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([sessionRow])
      .mockResolvedValueOnce([{ code: 'users:reset_password' }]);

    const repository = new AuthSessionRepository(
      { query } as never,
      config as never,
    );

    const principal = await repository.resolve('hash-token', now);

    const [updateSql] = query.mock.calls[0] as [string];

    expect(updateSql).toContain('UPDATE auth_sessions');
    expect(principal).toEqual({
      sessionId: 'sessao-1',
      sessionType: 'normal',
      userId: 'user-1',
      organizationId: 'org-1',
      absoluteExpiresAt: new Date('2026-09-22T12:00:00.000Z'),
      profile: 'admin',
      permissions: new Set(['users:reset_password']),
    });
  });
});
