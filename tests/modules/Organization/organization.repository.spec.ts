import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';

import {
  platformContext,
  TENANT_A_ID,
  TENANT_B_ID,
  tenantContext,
} from './organization.fixtures';

describe('OrganizationRepository.findReachable', () => {
  const build = () => {
    const findOne = jest.fn().mockResolvedValue({ id: TENANT_B_ID });
    const repository = new OrganizationRepository({
      manager: { findOne },
    } as never);

    return { repository, findOne };
  };

  it('nem consulta o banco quando o tenant pede outra organizacao', async () => {
    const { repository, findOne } = build();

    await expect(
      repository.findReachable(tenantContext, TENANT_B_ID),
    ).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('consulta a propria organizacao do tenant e qualquer uma para a plataforma', async () => {
    const { repository, findOne } = build();

    await repository.findReachable(tenantContext, TENANT_A_ID);
    await repository.findReachable(platformContext, TENANT_B_ID);

    expect(findOne).toHaveBeenCalledTimes(2);
  });
});
