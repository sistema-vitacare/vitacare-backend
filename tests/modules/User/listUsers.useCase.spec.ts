import { ListUsersQueryDto } from '@/modules/User/ListUsers/listUsers.dto';
import { ListUsersUseCase } from '@/modules/User/ListUsers/listUsers.useCase';
import { plainToInstance } from 'class-transformer';

import { ORGANIZATION_ID, adminCtx, userRow } from './user.fixtures';

describe('ListUsersUseCase', () => {
  it('lista o tenant da sessao com CPF mascarado e paginacao', async () => {
    const repository = { list: jest.fn().mockResolvedValue([[userRow()], 21]) };
    const useCase = new ListUsersUseCase(repository as never);
    const query = plainToInstance(ListUsersQueryDto, {
      page: '2',
      limit: '20',
      status: 'active',
      profileCode: 'professional',
      search: 'ana',
    });

    const result = await useCase.execute(query, adminCtx);

    expect(repository.list).toHaveBeenCalledWith(ORGANIZATION_ID, {
      status: 'active',
      profileCode: 'professional',
      search: 'ana',
      skip: 20,
      take: 20,
    });
    expect(result.data).toEqual([
      expect.objectContaining({ cpf: '***.982.247-**' }),
    ]);
    expect(result.extras.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 21,
      totalPages: 2,
    });
  });
});
