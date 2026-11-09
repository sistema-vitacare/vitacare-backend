import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';

import { assertDashboardAvailable } from '../policies/dashboardAccess.policy';
import { DashboardRepository } from '../repositories/dashboard.repository';
import type { DashboardUsersDto } from './getDashboardUsers.dto';

/** Detalhe de usuarios (UC05 passo 4): situacao agora, por perfil. */
@Injectable()
export class GetDashboardUsersUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(ctx: RequestContext): Promise<DashboardUsersDto> {
    await assertDashboardAvailable(this.dashboard, ctx.organizationId);

    const profiles = await this.dashboard.usersByProfile(ctx.organizationId);
    const sum = (status: 'active' | 'pending' | 'inactive') =>
      profiles.reduce((total, profile) => total + profile[status], 0);

    return {
      active: sum('active'),
      pending: sum('pending'),
      inactive: sum('inactive'),
      byProfile: profiles.map(({ code, name, active, pending, inactive }) => ({
        profile: { code, name },
        active,
        pending,
        inactive,
      })),
    };
  }
}
