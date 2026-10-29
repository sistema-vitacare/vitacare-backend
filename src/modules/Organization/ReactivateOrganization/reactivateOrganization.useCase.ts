import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { OrganizationDto } from '../dtos/organization.dto';
import { OrganizationErrors } from '../organization.errors';
import {
  toOrganizationActor,
  toOrganizationResponse,
} from '../parsers/organization.parser';
import { assertPlatformContext } from '../policies/organization.policy';
import { OrganizationRepository } from '../repositories/organization.repository';

/** Sessoes revogadas na inativacao continuam revogadas: o acesso volta por novo login. */
@Injectable()
export class ReactivateOrganizationUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(
    organizationId: string,
    ctx: RequestContext,
  ): Promise<OrganizationDto> {
    assertPlatformContext(ctx);

    const current = await this.organizations.findReachable(ctx, organizationId);

    if (!current) {
      throw new DomainException({
        ...OrganizationErrors.NOT_FOUND,
        detail: 'Organização inexistente.',
      });
    }

    if (current.status === 'active') {
      throw new DomainException({
        ...OrganizationErrors.ALREADY_ACTIVE,
        detail: 'Transição de active para active recusada.',
      });
    }

    const updated = await this.organizations.changeStatus(
      current.id,
      'inactive',
      'active',
      toOrganizationActor(ctx),
    );

    if (!updated) {
      throw new DomainException({
        ...OrganizationErrors.ALREADY_ACTIVE,
        detail: 'O status mudou durante a operação.',
      });
    }

    return toOrganizationResponse(updated, ctx);
  }
}
