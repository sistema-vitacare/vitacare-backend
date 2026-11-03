import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { Permissions } from '@/modules/Access/access.permissions';
import type { ChangeProfileOutcome } from '@/modules/User/ChangeUserProfile/changeUserProfile.type';
import { ChangeUserProfileUseCase } from '@/modules/User/ChangeUserProfile/changeUserProfile.useCase';

const ORGANIZATION_ID = '0000000a-0000-4000-8000-00000000000a';
const ACTOR_ID = '1111111a-0000-4000-8000-00000000000a';
const TARGET_ID = '2222222a-0000-4000-8000-00000000000a';

const ctx: RequestContext = {
  requestId: 'req-troca-perfil',
  userId: ACTOR_ID,
  organizationId: ORGANIZATION_ID,
  organizationKind: 'tenant',
  profile: ProfileCode.ADMIN,
  permissions: new Set([Permissions.USERS_CHANGE_PROFILE]),
};

const view = {
  id: TARGET_ID,
  name: 'Usuaria Sintetica',
  profileCode: 'professional',
  profileName: 'Profissional de saude',
};

describe('ChangeUserProfileUseCase', () => {
  const setup = (outcome?: ChangeProfileOutcome) => {
    const repository = {
      changeProfile: jest.fn().mockResolvedValue(outcome),
    };
    const useCase = new ChangeUserProfileUseCase(repository as never);

    return { repository, useCase };
  };

  const capture = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as DomainException;
    }

    throw new Error('O caso de uso deveria ter falhado.');
  };

  it('recusa trocar o proprio perfil com 409 antes de tocar o banco', async () => {
    const { repository, useCase } = setup();

    const error = await capture(
      useCase.execute(
        { userId: ACTOR_ID, profileCode: ProfileCode.FAMILY },
        ctx,
      ),
    );

    expect(error).toBeInstanceOf(DomainException);
    expect(error.getStatus()).toBe(409);
    expect(error.code).toBe('USER_SELF_PROFILE_CHANGE');
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  it('trata o proprio id em maiusculas como a propria conta', async () => {
    const { repository, useCase } = setup();

    const error = await capture(
      useCase.execute(
        { userId: ACTOR_ID.toUpperCase(), profileCode: ProfileCode.FAMILY },
        ctx,
      ),
    );

    expect(error.code).toBe('USER_SELF_PROFILE_CHANGE');
    expect(repository.changeProfile).not.toHaveBeenCalled();
  });

  it('monta o comando com organizacao, ator e requestId da sessao', async () => {
    const { repository, useCase } = setup({ kind: 'changed', user: view });

    await useCase.execute(
      { userId: TARGET_ID, profileCode: ProfileCode.PROFESSIONAL },
      ctx,
    );

    expect(repository.changeProfile).toHaveBeenCalledTimes(1);
    expect(repository.changeProfile).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      actorUserId: ACTOR_ID,
      targetUserId: TARGET_ID,
      profileCode: ProfileCode.PROFESSIONAL,
      requestId: 'req-troca-perfil',
    });
  });

  it('responde 404 USER_NOT_FOUND quando o alvo nao existe na organizacao', async () => {
    const { useCase } = setup({ kind: 'not_found' });

    const error = await capture(
      useCase.execute(
        { userId: TARGET_ID, profileCode: ProfileCode.CAREGIVER },
        ctx,
      ),
    );

    expect(error).toBeInstanceOf(DomainException);
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe('USER_NOT_FOUND');
    expect(error.detail).toBe('Usuário inexistente ou fora da organização.');
  });

  it('responde 403 AUTH_FORBIDDEN quando o ator deixou de ser admin ativo', async () => {
    const { useCase } = setup({ kind: 'actor_forbidden' });

    const error = await capture(
      useCase.execute(
        { userId: TARGET_ID, profileCode: ProfileCode.CAREGIVER },
        ctx,
      ),
    );

    expect(error).toBeInstanceOf(DomainException);
    expect(error.getStatus()).toBe(403);
    expect(error.code).toBe('AUTH_FORBIDDEN');
    expect(error.detail).toBe(
      'O ator deixou de ser administrador ativo antes da troca.',
    );
  });

  it('devolve o perfil atual quando nada muda', async () => {
    const { useCase } = setup({ kind: 'unchanged', user: view });

    const result = await useCase.execute(
      { userId: TARGET_ID, profileCode: ProfileCode.PROFESSIONAL },
      ctx,
    );

    expect(result).toEqual({
      id: TARGET_ID,
      name: 'Usuaria Sintetica',
      profile: { code: 'professional', name: 'Profissional de saude' },
    });
  });

  it('devolve id, nome e perfil novo quando troca', async () => {
    const { useCase } = setup({
      kind: 'changed',
      user: { ...view, profileCode: 'family', profileName: 'Familiar' },
    });

    const result = await useCase.execute(
      { userId: TARGET_ID, profileCode: ProfileCode.FAMILY },
      ctx,
    );

    expect(result).toEqual({
      id: TARGET_ID,
      name: 'Usuaria Sintetica',
      profile: { code: 'family', name: 'Familiar' },
    });
  });
});
