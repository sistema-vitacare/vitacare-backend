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

/**
 * Inativar corta na hora o acesso de todos os usuarios da organizacao e
 * preserva cadastro, usuarios e historico. O status dos usuarios nao muda:
 * reativar a organizacao devolve o acesso de quem ja estava ativo.
 */
@Injectable()
export class DeactivateOrganizationUseCase {
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

    if (current.kind === 'platform') {
      throw new DomainException({
        ...OrganizationErrors.PLATFORM_PROTECTED,
        detail: 'A organização de plataforma permanece sempre ativa.',
      });
    }

    if (current.status === 'inactive') {
      throw new DomainException({
        ...OrganizationErrors.ALREADY_INACTIVE,
        detail: 'Transição de inactive para inactive recusada.',
      });
    }

    const updated = await this.organizations.changeStatus(
      current.id,
      'active',
      'inactive',
      toOrganizationActor(ctx),
    );

    if (!updated) {
      throw new DomainException({
        ...OrganizationErrors.ALREADY_INACTIVE,
        detail: 'O status mudou durante a operação.',
      });
    }

    return toOrganizationResponse(updated, ctx);
  }
}
