import { isEnvelopePayload } from '@/common/http/envelope';
import { ListOrganizationsUseCase } from '@/modules/Organization/ListOrganizations/listOrganizations.useCase';

import {
  organizationOf,
  platformContext,
  repositoryMock,
  tenantContext,
} from './organization.fixtures';

const query = { page: 2, limit: 10, skip: 10, status: 'active' as const };

describe('ListOrganizationsUseCase', () => {
  it('pagina a listagem da plataforma', async () => {
    const organizations = repositoryMock();
    organizations.list.mockResolvedValue([[organizationOf()], 11]);

    const result = await new ListOrganizationsUseCase(
      organizations as never,
    ).execute(query, platformContext);

    expect(organizations.list).toHaveBeenCalledWith({
      status: 'active',
      search: undefined,
      skip: 10,
      take: 10,
    });
    expect(isEnvelopePayload(result)).toBe(true);
    expect(result.extras.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 11,
      totalPages: 2,
    });
  });

  it('recusa sessao de tenant', async () => {
    const organizations = repositoryMock();

    await expect(
      new ListOrganizationsUseCase(organizations as never).execute(
        query as never,
        tenantContext,
      ),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });

    expect(organizations.list).not.toHaveBeenCalled();
  });
});
