import { DeactivateOrganizationUseCase } from '@/modules/Organization/DeactivateOrganization/deactivateOrganization.useCase';
import { ReactivateOrganizationUseCase } from '@/modules/Organization/ReactivateOrganization/reactivateOrganization.useCase';

import {
  organizationOf,
  PLATFORM_ORG_ID,
  platformContext,
  repositoryMock,
  TENANT_A_ID,
  tenantContext,
} from './organization.fixtures';

const inactive = {
  status: 'inactive' as const,
  deletedAt: new Date('2026-09-22T11:00:00.000Z'),
};

describe('DeactivateOrganizationUseCase', () => {
  it('inativa a partir do estado ativo lido', async () => {
    const organizations = repositoryMock();
    organizations.findReachable.mockResolvedValue(organizationOf());
    organizations.changeStatus.mockResolvedValue(organizationOf(inactive));

    const result = await new DeactivateOrganizationUseCase(
      organizations as never,
    ).execute(TENANT_A_ID, platformContext);

    expect(organizations.changeStatus).toHaveBeenCalledWith(
      TENANT_A_ID,
      'active',
      'inactive',
      expect.objectContaining({ userId: 'master-1' }),
    );
    expect(result.status).toBe('inactive');
    expect(result.deletedAt).toBe('2026-09-22T11:00:00.000Z');
  });

  it.each([
    ['sessao de tenant', tenantContext, organizationOf(), 'AUTH_FORBIDDEN'],
    [
      'organizacao inexistente',
      platformContext,
      null,
      'ORGANIZATION_NOT_FOUND',
    ],
    [
      'organizacao de plataforma',
      platformContext,
      organizationOf({
        id: PLATFORM_ORG_ID,
        kind: 'platform',
        usagePlanId: null,
      }),
      'ORGANIZATION_PLATFORM_PROTECTED',
    ],
    [
      'organizacao ja inativa',
      platformContext,
      organizationOf(inactive),
      'ORGANIZATION_ALREADY_INACTIVE',
    ],
  ])('recusa %s', async (_case, ctx, current, code) => {
    const organizations = repositoryMock();
    organizations.findReachable.mockResolvedValue(current);

    await expect(
      new DeactivateOrganizationUseCase(organizations as never).execute(
        TENANT_A_ID,
        ctx,
      ),
    ).rejects.toMatchObject({ code });

    expect(organizations.changeStatus).not.toHaveBeenCalled();
  });

  it('responde conflito quando o status muda entre a leitura e a escrita', async () => {
    const organizations = repositoryMock();
    organizations.findReachable.mockResolvedValue(organizationOf());
    organizations.changeStatus.mockResolvedValue(null);

    await expect(
      new DeactivateOrganizationUseCase(organizations as never).execute(
        TENANT_A_ID,
        platformContext,
      ),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_ALREADY_INACTIVE' });
  });
});

describe('ReactivateOrganizationUseCase', () => {
  it('reativa a partir do estado inativo lido', async () => {
    const organizations = repositoryMock();
    organizations.findReachable.mockResolvedValue(organizationOf(inactive));
    organizations.changeStatus.mockResolvedValue(organizationOf());

    const result = await new ReactivateOrganizationUseCase(
      organizations as never,
    ).execute(TENANT_A_ID, platformContext);

    expect(organizations.changeStatus).toHaveBeenCalledWith(
      TENANT_A_ID,
      'inactive',
      'active',
      expect.anything(),
    );
    expect(result.deletedAt).toBeNull();
  });

  it('recusa organizacao ja ativa e sessao de tenant', async () => {
    const organizations = repositoryMock();
    organizations.findReachable.mockResolvedValue(organizationOf());
    const useCase = new ReactivateOrganizationUseCase(organizations as never);

    await expect(
      useCase.execute(TENANT_A_ID, platformContext),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_ALREADY_ACTIVE' });

    await expect(
      useCase.execute(TENANT_A_ID, tenantContext),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });
  });
});
