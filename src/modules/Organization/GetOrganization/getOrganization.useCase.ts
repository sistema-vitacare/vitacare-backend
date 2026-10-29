import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { OrganizationDto } from '../dtos/organization.dto';
import { OrganizationErrors } from '../organization.errors';
import { toOrganizationResponse } from '../parsers/organization.parser';
import { OrganizationRepository } from '../repositories/organization.repository';

@Injectable()
export class GetOrganizationUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(
    organizationId: string,
    ctx: RequestContext,
  ): Promise<OrganizationDto> {
    const organization = await this.organizations.findReachable(
      ctx,
      organizationId,
    );

    if (!organization) {
      throw new DomainException({
        ...OrganizationErrors.NOT_FOUND,
        detail: 'Organização inexistente ou fora do alcance da sessão.',
      });
    }

    return toOrganizationResponse(organization, ctx);
  }
}
