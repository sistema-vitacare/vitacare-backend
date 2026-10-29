import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';

import {
  organizationOf,
  platformContext,
  repositoryMock,
  tenantContext,
} from './organization.fixtures';

const input = {
  code: 'clinica-nova',
  tradeName: 'Clinica Nova',
  usagePlanId: '0000000c-0000-4000-8000-00000000000c',
  administrator: {
    name: 'Admin Nova',
    email: 'admin@nova.test',
    cpf: '52998224725',
  },
};

const build = () => {
  const organizations = repositoryMock();
  const passwords = { hash: jest.fn().mockResolvedValue('hash-provisorio') };

  organizations.create.mockResolvedValue({
    organization: organizationOf({ code: 'clinica-nova' }),
    administratorId: 'admin-novo',
  });

  return {
    organizations,
    passwords,
    useCase: new CreateOrganizationUseCase(
      organizations as never,
      passwords as never,
    ),
  };
};

describe('CreateOrganizationUseCase', () => {
  it('cria organizacao e primeiro administrador guardando apenas o hash da senha', async () => {
    const { useCase, organizations, passwords } = build();

    const result = await useCase.execute(input, platformContext);

    expect(result.temporaryPassword).toHaveLength(20);
    expect(passwords.hash).toHaveBeenCalledWith(result.temporaryPassword);
    expect(organizations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'clinica-nova',
        legalName: null,
        document: null,
        administrator: expect.objectContaining({
          cpf: '52998224725',
          phone: null,
          passwordHash: 'hash-provisorio',
        }) as unknown,
      }),
      {
        userId: 'master-1',
        organizationId: platformContext.organizationId,
        requestId: 'req-plataforma',
      },
    );
    expect(result.administrator).toEqual({
      id: 'admin-novo',
      name: 'Admin Nova',
      email: 'admin@nova.test',
    });
    expect(result.organization.kind).toBe('tenant');
  });

  it('recusa sessao de tenant mesmo que a rota tenha sido alcancada', async () => {
    const { useCase, organizations } = build();

    await expect(
      useCase.execute(input as never, tenantContext),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });

    expect(organizations.create).not.toHaveBeenCalled();
  });
});
