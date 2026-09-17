import type { Repository } from 'typeorm';
import {
  ProfileCode,
  type RequestContext,
} from '../context/requestContext.type';
import { DomainException } from '../errors/domain.exception';
import {
  TenantScopedRepository,
  type TenantOwned,
} from './tenantScoped.repository';

interface Patient extends TenantOwned {
  id: string;
  fullName: string;
}

const ctx: RequestContext = {
  requestId: 'req-1',
  userId: 'user-1',
  organizationId: 'org-1',
  profile: ProfileCode.PROFESSIONAL,
  permissions: new Set<string>(),
};

describe('TenantScopedRepository', () => {
  const inner = {
    metadata: { tableName: 'patients' },
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    merge: jest.fn((target: object, patch: object) => ({
      ...target,
      ...patch,
    })),
    save: jest.fn((value: unknown): Promise<unknown> => Promise.resolve(value)),
    manager: { transaction: jest.fn() },
  };

  const repo = new TenantScopedRepository<Patient>(
    inner as unknown as Repository<Patient>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    inner.findAndCount.mockResolvedValue([[], 0]);
    inner.findOne.mockResolvedValue(null);
  });

  it('injeta a organizacao do contexto na listagem', async () => {
    await repo.findManyScoped(ctx, { where: { fullName: 'Ana' }, take: 10 });

    expect(inner.findAndCount).toHaveBeenCalledWith({
      where: { fullName: 'Ana', organizationId: 'org-1' },
      take: 10,
    });
  });

  it('injeta a organizacao mesmo sem filtro informado', async () => {
    await repo.findManyScoped(ctx);

    expect(inner.findAndCount).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
  });

  it('injeta a organizacao na busca por um registro', async () => {
    await repo.findOneScoped(ctx, { id: '7f3a' });

    expect(inner.findOne).toHaveBeenCalledWith({
      where: { id: '7f3a', organizationId: 'org-1' },
    });
  });

  it('ignora organizationId vindo do input e usa o do contexto', async () => {
    await repo.createScoped(ctx, {
      fullName: 'Ana',
      organizationId: 'org-INVASORA',
    });

    expect(inner.create).toHaveBeenCalledWith({
      fullName: 'Ana',
      organizationId: 'org-1',
    });
  });

  it('devolve null ao atualizar registro de outra organizacao', async () => {
    inner.findOne.mockResolvedValueOnce(null);

    await expect(
      repo.updateScoped(ctx, { id: '7f3a' }, { fullName: 'Nova' }),
    ).resolves.toBeNull();
    expect(inner.save).not.toHaveBeenCalled();
  });

  it('mantem a organizacao do contexto ao atualizar', async () => {
    inner.findOne.mockResolvedValueOnce({
      id: '7f3a',
      fullName: 'Ana',
      organizationId: 'org-1',
    });

    await repo.updateScoped(
      ctx,
      { id: '7f3a' },
      { fullName: 'Ana Souza', organizationId: 'org-INVASORA' },
    );

    expect(inner.save).toHaveBeenCalledWith({
      id: '7f3a',
      fullName: 'Ana Souza',
      organizationId: 'org-1',
    });
  });

  it('traduz erro do driver em DomainException', async () => {
    inner.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'ux_patients_org_document',
    });

    await expect(
      repo.createScoped(ctx, { fullName: 'Ana' }),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it('propaga erro nao mapeado sem mascarar', async () => {
    const original = new Error('conexao perdida');
    inner.save.mockRejectedValueOnce(original);

    await expect(repo.createScoped(ctx, { fullName: 'Ana' })).rejects.toBe(
      original,
    );
  });
});
