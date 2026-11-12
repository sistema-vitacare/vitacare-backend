import { Injectable } from '@nestjs/common';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import type { SessionProfileDto } from '@/modules/Auth/dtos/sessionProfile.dto';
import { AuthIdentityRepository } from '@/modules/Auth/repositories/authIdentity.repository';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';

import { GetOwnProfileUseCase } from '../GetOwnProfile/getOwnProfile.useCase';
import { ProfileErrors } from '../profile.errors';
import { OwnProfileRepository } from '../repositories/ownProfile.repository';
import type { UpdateOwnProfileDto } from './updateOwnProfile.dto';
import type { OwnProfilePatch } from './updateOwnProfile.type';

/**
 * Edicao do proprio cadastro (BE-27). Nome e telefone sao livres; trocar o
 * e-mail, que e o login, pede a senha atual. A troca nao encerra sessoes
 * (mesma regra da edicao pelo admin no BE-06) e invalida o link de
 * recuperacao enviado ao e-mail antigo.
 */
@Injectable()
export class UpdateOwnProfileUseCase {
  constructor(
    private readonly identities: AuthIdentityRepository,
    private readonly passwords: PasswordHasher,
    private readonly profiles: OwnProfileRepository,
    private readonly getOwnProfile: GetOwnProfileUseCase,
  ) {}

  async execute(
    input: UpdateOwnProfileDto,
    ctx: RequestContext,
  ): Promise<SessionProfileDto> {
    const patch: OwnProfilePatch = Object.fromEntries(
      (['name', 'email', 'phone'] as const)
        .filter((field) => input[field] !== undefined)
        .map((field) => [field, input[field]]),
    );

    if (Object.keys(patch).length === 0) {
      throw new DomainException({
        ...ProfileErrors.NOTHING_TO_UPDATE,
        detail: 'Corpo sem nenhum campo editável.',
      });
    }

    const verifiedPasswordHash = (await this.emailChanges(patch, ctx))
      ? await this.reauthenticate(input.currentPassword, ctx)
      : null;

    const outcome = await this.profiles.update({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      requestId: ctx.requestId,
      patch,
      verifiedPasswordHash,
    });

    if (outcome.kind === 'inactive') {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'A conta não está mais ativa.',
      });
    }

    if (outcome.kind === 'reauthentication_failed') {
      throw new DomainException({
        ...AuthErrors.CURRENT_PASSWORD_INVALID,
        detail: 'A senha mudou durante a troca de e-mail.',
      });
    }

    return this.getOwnProfile.execute(ctx);
  }

  private async emailChanges(
    patch: OwnProfilePatch,
    ctx: RequestContext,
  ): Promise<boolean> {
    if (patch.email === undefined) {
      return false;
    }

    const current = await this.identities.findSessionProfile(
      ctx.userId,
      ctx.organizationId,
    );

    return current?.user.email.toLowerCase() !== patch.email.toLowerCase();
  }

  /** Mesma verificacao da troca de senha; o valor nunca e gravado. */
  private async reauthenticate(
    currentPassword: string | undefined,
    ctx: RequestContext,
  ): Promise<string> {
    if (currentPassword === undefined) {
      throw new DomainException({
        ...ProfileErrors.CURRENT_PASSWORD_REQUIRED,
        detail: 'Troca de e-mail sem a senha atual.',
        fields: [{ field: 'currentPassword', code: 'REQUIRED' }],
      });
    }

    const currentHash = await this.identities.findPasswordHash(
      ctx.userId,
      ctx.organizationId,
    );

    const matches =
      currentHash !== null &&
      (await this.passwords.verify(currentHash, currentPassword));

    if (!matches) {
      throw new DomainException({
        ...AuthErrors.CURRENT_PASSWORD_INVALID,
        detail: 'A senha atual não confere.',
      });
    }

    return currentHash;
  }
}
