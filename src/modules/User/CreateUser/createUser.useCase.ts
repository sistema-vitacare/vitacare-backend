import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { generateTemporaryPassword } from '@/modules/Auth/security/temporaryPassword';

import { toUserResponse } from '../parsers/user.parser';
import { UserRepository } from '../repositories/user.repository';
import { UserErrors } from '../user.errors';
import type { CreateUserDto, CreateUserResponseDto } from './createUser.dto';

/**
 * Cadastro do UC03 (passo 3) com o convite do passo 6 traduzido para senha
 * provisoria: sem SMTP, o administrador a recebe uma unica vez e a entrega ao
 * usuario fora da API. O usuario fica `pending` ate o primeiro acesso.
 */
@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHasher,
    private readonly config: ConfigService,
  ) {}

  async execute(
    input: CreateUserDto,
    ctx: RequestContext,
  ): Promise<CreateUserResponseDto> {
    const temporaryPassword = generateTemporaryPassword();
    const expiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('auth.temporaryPasswordSeconds') * 1000,
    );

    const outcome = await this.users.create({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      name: input.name,
      email: input.email,
      cpf: input.cpf,
      phone: input.phone ?? null,
      profileCode: input.profileCode,
      passwordHash: await this.passwords.hash(temporaryPassword),
      expiresAt,
    });

    switch (outcome.kind) {
      case 'plan_expired':
        throw new DomainException({
          ...UserErrors.PLAN_EXPIRED,
          detail: 'O termo corrente do plano da organização está vencido.',
        });

      case 'limit_reached':
        throw new DomainException({
          ...UserErrors.PLAN_LIMIT_REACHED,
          detail: 'Usuários pendentes e ativos já ocupam o limite do plano.',
        });

      case 'actor_forbidden':
        throw new DomainException({
          ...AuthErrors.FORBIDDEN,
          detail: 'O ator deixou de ser administrador ativo antes do cadastro.',
        });

      default:
        return {
          user: toUserResponse(outcome.user, ctx),
          temporaryPassword,
          expiresAt: expiresAt.toISOString(),
        };
    }
  }
}
