import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import type { SessionProfileRow } from '@/modules/Auth/types/auth.types';
import { GetOwnProfileUseCase } from '@/modules/Profile/GetOwnProfile/getOwnProfile.useCase';
import type { UpdateOwnProfileOutcome } from '@/modules/Profile/UpdateOwnProfile/updateOwnProfile.type';
import { UpdateOwnProfileUseCase } from '@/modules/Profile/UpdateOwnProfile/updateOwnProfile.useCase';

const ctx: RequestContext = {
  requestId: 'req-1',
  userId: 'user-1',
  organizationId: 'org-1',
  organizationKind: 'tenant',
  profile: ProfileCode.CAREGIVER,
  permissions: new Set(['profile:manage']),
};

const sessionRow: SessionProfileRow = {
  user: {
    id: 'user-1',
    name: 'Ana Exemplo',
    email: 'ana@example.test',
    cpf: '12345678909',
    phone: null,
    status: 'active',
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
  },
  profile: { code: ProfileCode.CAREGIVER, name: 'Cuidador' },
  permissions: ['profile:manage', 'patients:read'],
  organization: {
    id: 'org-1',
    code: 'clinica-a',
    tradeName: 'Clinica A',
    legalName: null,
    kind: 'tenant',
    status: 'active',
    plan: null,
  },
};

const build = (
  options: {
    session?: SessionProfileRow | null;
    passwordHash?: string | null;
    passwordMatches?: boolean;
    outcome?: UpdateOwnProfileOutcome;
  } = {},
) => {
  const identities = {
    findSessionProfile: jest
      .fn()
      .mockResolvedValue(
        options.session === undefined ? sessionRow : options.session,
      ),
    findPasswordHash: jest
      .fn()
      .mockResolvedValue(
        options.passwordHash === undefined ? 'hash-1' : options.passwordHash,
      ),
  };
  const passwords = {
    verify: jest.fn().mockResolvedValue(options.passwordMatches ?? true),
  };
  const profiles = {
    update: jest.fn().mockResolvedValue(options.outcome ?? { kind: 'updated' }),
  };
  const getOwnProfile = new GetOwnProfileUseCase(identities as never);
  const useCase = new UpdateOwnProfileUseCase(
    identities as never,
    passwords as never,
    profiles as never,
    getOwnProfile,
  );

  return { useCase, getOwnProfile, identities, passwords, profiles };
};

const rejectsWith = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(DomainException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('GetOwnProfileUseCase (BE-27)', () => {
  it('le o usuario da sessao com o CPF completo', async () => {
    const { getOwnProfile, identities } = build();

    const result = await getOwnProfile.execute(ctx);

    expect(identities.findSessionProfile).toHaveBeenCalledWith(
      'user-1',
      'org-1',
    );
    expect(result.user.cpf).toBe('12345678909');
    expect(result.permissions).toEqual(['patients:read', 'profile:manage']);
  });

  it('usuario da sessao ausente responde 401', async () => {
    const { getOwnProfile } = build({ session: null });

    await rejectsWith(getOwnProfile.execute(ctx), 'AUTH_UNAUTHENTICATED');
  });
});

describe('UpdateOwnProfileUseCase (BE-27)', () => {
  it('corpo sem campo editavel e PROFILE_NOTHING_TO_UPDATE', async () => {
    const { useCase, profiles } = build();

    await rejectsWith(
      useCase.execute({ currentPassword: 'senha atual' }, ctx),
      'PROFILE_NOTHING_TO_UPDATE',
    );
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('nome e telefone nao pedem senha; alvo vem da sessao', async () => {
    const { useCase, profiles, passwords } = build();

    const result = await useCase.execute(
      { name: 'Ana Nova', phone: null },
      ctx,
    );

    expect(passwords.verify).not.toHaveBeenCalled();
    expect(profiles.update).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      requestId: 'req-1',
      patch: { name: 'Ana Nova', phone: null },
      verifiedPasswordHash: null,
    });
    expect(result.user.cpf).toBe('12345678909');
  });

  it('e-mail igual ao atual (outra caixa) nao pede senha', async () => {
    const { useCase, passwords, profiles } = build();

    await useCase.execute({ email: 'ANA@example.test' }, ctx);

    expect(passwords.verify).not.toHaveBeenCalled();
    expect(profiles.update).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedPasswordHash: null }),
    );
  });

  it('trocar o e-mail sem senha atual e PROFILE_CURRENT_PASSWORD_REQUIRED', async () => {
    const { useCase, profiles } = build();

    const promise = useCase.execute({ email: 'nova@example.test' }, ctx);

    await rejectsWith(promise, 'PROFILE_CURRENT_PASSWORD_REQUIRED');
    await expect(promise).rejects.toMatchObject({
      status: 422,
      fields: [{ field: 'currentPassword', code: 'REQUIRED' }],
    });
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('senha errada na troca de e-mail e AUTH_CURRENT_PASSWORD_INVALID', async () => {
    const { useCase, profiles } = build({ passwordMatches: false });

    await rejectsWith(
      useCase.execute(
        { email: 'nova@example.test', currentPassword: 'senha errada' },
        ctx,
      ),
      'AUTH_CURRENT_PASSWORD_INVALID',
    );
    expect(profiles.update).not.toHaveBeenCalled();
  });

  it('senha conferida segue para a transacao com o hash verificado', async () => {
    const { useCase, profiles, passwords } = build();

    await useCase.execute(
      { email: 'nova@example.test', currentPassword: 'senha atual' },
      ctx,
    );

    expect(passwords.verify).toHaveBeenCalledWith('hash-1', 'senha atual');
    expect(profiles.update).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: { email: 'nova@example.test' },
        verifiedPasswordHash: 'hash-1',
      }),
    );
  });

  it('conta inativada no meio responde 401', async () => {
    const { useCase } = build({ outcome: { kind: 'inactive' } });

    await rejectsWith(
      useCase.execute({ name: 'Ana' }, ctx),
      'AUTH_UNAUTHENTICATED',
    );
  });

  it('senha trocada durante a troca de e-mail responde 422', async () => {
    const { useCase } = build({
      outcome: { kind: 'reauthentication_failed' },
    });

    await rejectsWith(
      useCase.execute(
        { email: 'nova@example.test', currentPassword: 'senha atual' },
        ctx,
      ),
      'AUTH_CURRENT_PASSWORD_INVALID',
    );
  });
});
