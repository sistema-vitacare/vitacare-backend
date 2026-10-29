import { UpdateOrganizationUseCase } from '@/modules/Organization/UpdateOrganization/updateOrganization.useCase';

import {
  organizationOf,
  platformContext,
  repositoryMock,
  TENANT_A_ID,
  TENANT_B_ID,
  tenantContext,
} from './organization.fixtures';

const build = () => {
  const organizations = repositoryMock();

  return {
    organizations,
    useCase: new UpdateOrganizationUseCase(organizations as never),
  };
};

describe('UpdateOrganizationUseCase', () => {
  it('grava somente os campos enviados e aceita null para limpar', async () => {
    const { useCase, organizations } = build();
    organizations.findReachable.mockResolvedValue(organizationOf());
    organizations.update.mockResolvedValue(
      organizationOf({ tradeName: 'Novo nome' }),
    );

    const result = await useCase.execute(
      TENANT_A_ID,
      { tradeName: 'Novo nome', legalName: null, phone: undefined },
      tenantContext,
    );

    expect(organizations.update).toHaveBeenCalledWith(
      TENANT_A_ID,
      { tradeName: 'Novo nome', legalName: null },
      {
        userId: 'admin-a',
        organizationId: TENANT_A_ID,
        requestId: 'req-tenant',
      },
    );
    expect(result.tradeName).toBe('Novo nome');
  });

  it('recusa corpo sem campo editavel antes de tocar no banco', async () => {
    const { useCase, organizations } = build();

    await expect(
      useCase.execute(TENANT_A_ID, {}, tenantContext),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_NOTHING_TO_UPDATE' });

    expect(organizations.findReachable).not.toHaveBeenCalled();
  });

  it('trata organizacao de outro tenant como inexistente', async () => {
    const { useCase, organizations } = build();
    organizations.findReachable.mockResolvedValue(null);

    await expect(
      useCase.execute(TENANT_B_ID, { tradeName: 'Invasao' }, tenantContext),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });

    expect(organizations.update).not.toHaveBeenCalled();
  });

  it('permite a plataforma editar outra organizacao', async () => {
    const { useCase, organizations } = build();
    organizations.findReachable.mockResolvedValue(
      organizationOf({ id: TENANT_B_ID }),
    );
    organizations.update.mockResolvedValue(organizationOf({ id: TENANT_B_ID }));

    await useCase.execute(
      TENANT_B_ID,
      { email: 'b@example.test' },
      platformContext,
    );

    expect(organizations.update).toHaveBeenCalledWith(
      TENANT_B_ID,
      { email: 'b@example.test' },
      expect.objectContaining({ userId: 'master-1' }),
    );
  });
});
