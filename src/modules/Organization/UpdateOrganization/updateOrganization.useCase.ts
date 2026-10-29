import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import type { OrganizationDto } from '../dtos/organization.dto';
import { OrganizationErrors } from '../organization.errors';
import {
  toOrganizationActor,
  toOrganizationResponse,
} from '../parsers/organization.parser';
import { OrganizationRepository } from '../repositories/organization.repository';
import type { OrganizationPatch } from '../types/organization.types';
import type { UpdateOrganizationDto } from './updateOrganization.dto';

const EDITABLE_FIELDS = [
  'tradeName',
  'legalName',
  'document',
  'phone',
  'email',
] as const satisfies ReadonlyArray<keyof OrganizationPatch>;

const toPatch = (input: UpdateOrganizationDto): OrganizationPatch =>
  Object.fromEntries(
    EDITABLE_FIELDS.filter((field) => input[field] !== undefined).map(
      (field) => [field, input[field]],
    ),
  );

@Injectable()
export class UpdateOrganizationUseCase {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(
    organizationId: string,
    input: UpdateOrganizationDto,
    ctx: RequestContext,
  ): Promise<OrganizationDto> {
    const patch = toPatch(input);

    if (Object.keys(patch).length === 0) {
      throw new DomainException({
        ...OrganizationErrors.NOTHING_TO_UPDATE,
        detail: 'Corpo sem nenhum campo editável.',
      });
    }

    const current = await this.organizations.findReachable(ctx, organizationId);

    const updated =
      current &&
      (await this.organizations.update(
        current.id,
        patch,
        toOrganizationActor(ctx),
      ));

    if (!updated) {
      throw new DomainException({
        ...OrganizationErrors.NOT_FOUND,
        detail: 'Organização inexistente ou fora do alcance da sessão.',
      });
    }

    return toOrganizationResponse(updated, ctx);
  }
}
