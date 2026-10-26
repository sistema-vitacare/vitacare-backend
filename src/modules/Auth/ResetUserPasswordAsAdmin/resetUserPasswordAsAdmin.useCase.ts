import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';

import { AuthErrors } from '../auth.errors';
import { AuthTransactionRepository } from '../repositories/authTransaction.repository';
import { PasswordHasher } from '../security/passwordHasher';

/** Sem caracteres ambiguos: a senha e lida e digitada por uma pessoa. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const TEMPORARY_PASSWORD_LENGTH = 20;

export const generateTemporaryPassword = (): string =>
  Array.from(
    { length: TEMPORARY_PASSWORD_LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join('');

@Injectable()
export class ResetUserPasswordAsAdminUseCase {
  constructor(
    private readonly passwords: PasswordHasher,
    private readonly transactions: AuthTransactionRepository,
  ) {}

  /**
   * Redefinicao administrativa dentro da propria organizacao: devolve a senha
   * uma unica vez, guarda apenas o hash, forca a troca no proximo acesso e
   * revoga as sessoes do alvo. A organizacao vem da sessao do administrador,
   * entao um alvo de outro tenant responde como inexistente.
   */
  async execute(
    input: { userId: string },
    ctx: RequestContext,
  ): Promise<{ temporaryPassword: string }> {
    if (input.userId === ctx.userId) {
      throw new DomainException({
        ...AuthErrors.INVALID_STATE,
        detail:
          'A redefinição administrativa não pode atingir a própria conta.',
      });
    }

    const temporaryPassword = generateTemporaryPassword();

    const result = await this.transactions.resetUserPasswordAsAdmin({
      targetUserId: input.userId,
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      passwordHash: await this.passwords.hash(temporaryPassword),
      requestId: ctx.requestId,
    });

    if (result !== 'updated') {
      throw new DomainException({
        ...AuthErrors.USER_NOT_FOUND,
        detail: 'Usuário inexistente ou fora da organização.',
      });
    }

    return { temporaryPassword };
  }
}
