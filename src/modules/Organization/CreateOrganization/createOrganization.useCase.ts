import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { generateTemporaryPassword } from '@/modules/Auth/security/temporaryPassword';

import {
  toOrganizationActor,
  toOrganizationResponse,
} from '../parsers/organization.parser';
import { assertPlatformContext } from '../policies/organization.policy';
import { OrganizationRepository } from '../repositories/organization.repository';
import type {
  CreateOrganizationDto,
  CreateOrganizationResponseDto,
} from './createOrganization.dto';

@Injectable()
export class CreateOrganizationUseCase {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  /**
   * Organizacao, perfil `admin` com as permissoes de administrador do tenant e
   * o primeiro administrador saem juntos ou nao saem. A senha provisoria so
   * existe nesta resposta; o banco guarda o hash.
   */
  async execute(
    input: CreateOrganizationDto,
    ctx: RequestContext,
  ): Promise<CreateOrganizationResponseDto> {
    assertPlatformContext(ctx);

    const temporaryPassword = generateTemporaryPassword();
    const { administrator } = input;

    const created = await this.organizations.create(
      {
        code: input.code,
        tradeName: input.tradeName,
        legalName: input.legalName ?? null,
        document: input.document ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        usagePlanId: input.usagePlanId,
        administrator: {
          name: administrator.name,
          email: administrator.email,
          cpf: administrator.cpf,
          phone: administrator.phone ?? null,
          passwordHash: await this.passwords.hash(temporaryPassword),
        },
      },
      toOrganizationActor(ctx),
    );

    return {
      organization: toOrganizationResponse(created.organization, ctx),
      administrator: {
        id: created.administratorId,
        name: administrator.name,
        email: administrator.email,
      },
      temporaryPassword,
    };
  }
}
