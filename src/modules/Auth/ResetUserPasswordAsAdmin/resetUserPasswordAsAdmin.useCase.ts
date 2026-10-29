import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { PasswordHasher } from '../security/passwordHasher';
import { generateTemporaryPassword } from '../security/temporaryPassword';

@Injectable()
export class ResetUserPasswordAsAdminUseCase {
  constructor(
    private readonly passwords: PasswordHasher,
    private readonly transactions: AuthTransactionRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Redefinicao administrativa dentro da propria organizacao: devolve a senha
   * uma unica vez, guarda apenas o hash, forca a troca no proximo acesso e
   * revoga as sessoes e o link de recuperacao do alvo. Repetir emite outra
   * senha e invalida a anterior. A organizacao vem da sessao do administrador,
   * entao um alvo de outro tenant responde como inexistente.
   */
  async execute(
    input: { userId: string },
    ctx: RequestContext,
  ): Promise<{ temporaryPassword: string; expiresAt: Date }> {
    if (input.userId === ctx.userId) {
      throw new DomainException({
        ...AuthErrors.INVALID_STATE,
        detail:
          'A redefinição administrativa não pode atingir a própria conta.',
      });
    }

    const temporaryPassword = generateTemporaryPassword();
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('auth.temporaryPasswordSeconds') * 1000,
    );

    const result = await this.transactions.resetUserPasswordAsAdmin({
      targetUserId: input.userId,
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      passwordHash: await this.passwords.hash(temporaryPassword),
      expiresAt,
      requestId: ctx.requestId,
    });

    if (result !== 'updated') {
      throw new DomainException({
        ...AuthErrors.USER_NOT_FOUND,
        detail: 'Usuário inexistente ou fora da organização.',
      });
    }

    return { temporaryPassword, expiresAt };
  }
}
