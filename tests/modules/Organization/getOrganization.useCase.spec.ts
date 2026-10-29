import { GetOrganizationUseCase } from '@/modules/Organization/GetOrganization/getOrganization.useCase';

import {
  organizationOf,
  platformContext,
  repositoryMock,
  TENANT_A_ID,
  TENANT_B_ID,
  tenantContext,
} from './organization.fixtures';

describe('GetOrganizationUseCase', () => {
  it('devolve a propria organizacao sem expor o tipo ao tenant', async () => {
    const organizations = repositoryMock();
    organizations.findReachable.mockResolvedValue(organizationOf());

    const result = await new GetOrganizationUseCase(
      organizations as never,
    ).execute(TENANT_A_ID, tenantContext);

    expect(organizations.findReachable).toHaveBeenCalledWith(
      tenantContext,
      TENANT_A_ID,
    );
    expect(result.id).toBe(TENANT_A_ID);
    expect(result).not.toHaveProperty('kind');
  });

  it('responde 404 para organizacao fora do alcance da sessao', async () => {
    const organizations = repositoryMock();
    organizations.findReachable.mockResolvedValue(null);

    await expect(
      new GetOrganizationUseCase(organizations as never).execute(
        TENANT_B_ID,
        tenantContext,
      ),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND', status: 404 });
  });

  it('expoe o tipo para a plataforma', async () => {
    const organizations = repositoryMock();
    organizations.findReachable.mockResolvedValue(
      organizationOf({ id: TENANT_B_ID }),
    );

    const result = await new GetOrganizationUseCase(
      organizations as never,
    ).execute(TENANT_B_ID, platformContext);

    expect(result.kind).toBe('tenant');
  });
});
