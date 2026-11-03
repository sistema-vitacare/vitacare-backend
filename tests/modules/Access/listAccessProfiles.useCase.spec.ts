import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { ListAccessProfilesUseCase } from '@/modules/Access/ListAccessProfiles/listAccessProfiles.useCase';
import type { AccessProfileRecord } from '@/modules/Access/repositories/accessProfile.repository';

const ctx: RequestContext = {
  requestId: 'req-perfis',
  userId: 'admin-a',
  organizationId: '0000000a-0000-4000-8000-00000000000a',
  organizationKind: 'tenant',
  profile: ProfileCode.ADMIN,
  permissions: new Set(['access_profiles:read']),
};

const recordOf = (
  code: string,
  overrides: Partial<AccessProfileRecord> = {},
): AccessProfileRecord => ({
  code,
  name: `Perfil ${code}`,
  description: null,
  permissions: [],
  ...overrides,
});

describe('ListAccessProfilesUseCase', () => {
  const run = async (records: AccessProfileRecord[]) => {
    const repository = {
      listLiveWithPermissions: jest.fn().mockResolvedValue(records),
    };

    const result = await new ListAccessProfilesUseCase(
      repository as never,
    ).execute(ctx);

    return { repository, result };
  };

  it('passa o contexto da sessao ao repositorio', async () => {
    const { repository } = await run([]);

    expect(repository.listLiveWithPermissions).toHaveBeenCalledWith(ctx);
  });

  it('ordena admin, professional, caregiver e family mesmo fora de ordem', async () => {
    const { result } = await run([
      recordOf('family'),
      recordOf('caregiver'),
      recordOf('admin'),
      recordOf('professional'),
    ]);

    expect(result.map((profile) => profile.code)).toEqual([
      'admin',
      'professional',
      'caregiver',
      'family',
    ]);
  });

  it('manda codigos desconhecidos para o fim, ordenados por codigo', async () => {
    const { result } = await run([
      recordOf('supervisor'),
      recordOf('family'),
      recordOf('auditor'),
      recordOf('admin'),
    ]);

    expect(result.map((profile) => profile.code)).toEqual([
      'admin',
      'family',
      'auditor',
      'supervisor',
    ]);
  });

  it('devolve so codigo, nome, descricao e permissoes, sem ids internos', async () => {
    const { result } = await run([
      {
        code: 'family',
        name: 'Familiar',
        description: 'Familiar com acesso somente leitura',
        permissions: [{ code: 'patients:read', name: 'Consultar pacientes' }],
        id: 'id-interno',
      } as AccessProfileRecord,
      recordOf('caregiver', { description: null }),
    ]);

    expect(result).toEqual([
      {
        code: 'caregiver',
        name: 'Perfil caregiver',
        description: null,
        permissions: [],
      },
      {
        code: 'family',
        name: 'Familiar',
        description: 'Familiar com acesso somente leitura',
        permissions: [{ code: 'patients:read', name: 'Consultar pacientes' }],
      },
    ]);
  });
});
