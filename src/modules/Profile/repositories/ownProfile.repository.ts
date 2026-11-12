import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { UserErrors } from '@/modules/User/user.errors';

import type {
  OwnProfilePatch,
  UpdateOwnProfileCommand,
  UpdateOwnProfileOutcome,
} from '../UpdateOwnProfile/updateOwnProfile.type';

interface OwnUserRow {
  name: string;
  email: string;
  phone: string | null;
  status: string;
  deletedAt: Date | null;
  passwordHash: string | null;
}

interface PostgresError {
  code: string;
  constraint?: string;
}

const PATCH_COLUMNS: Readonly<Record<keyof OwnProfilePatch, string>> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
};

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

/**
 * Escrita do proprio cadastro (BE-27). O alvo e sempre o usuario da sessao, na
 * organizacao da sessao. Segue a regra de escrita de usuario do BE-06: trava a
 * organizacao (`FOR NO KEY UPDATE`, mesma ordem da inativacao), rele o usuario
 * travado e grava a auditoria na mesma transacao.
 */
@Injectable()
export class OwnProfileRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** Grava so o que mudou; nada mudou nao grava nem audita. */
  async update(
    command: UpdateOwnProfileCommand,
  ): Promise<UpdateOwnProfileOutcome> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.updateIn(manager, command),
      );
    } catch (error) {
      throw this.translate(error);
    }
  }

  private async updateIn(
    manager: EntityManager,
    command: UpdateOwnProfileCommand,
  ): Promise<UpdateOwnProfileOutcome> {
    await manager.query(
      `SELECT 1 FROM organizations WHERE id = $1 FOR NO KEY UPDATE`,
      [command.organizationId],
    );

    const [current] = await manager.query<OwnUserRow[]>(
      `SELECT name,
              email,
              phone,
              status,
              deleted_at AS "deletedAt",
              password_hash AS "passwordHash"
         FROM users
        WHERE organization_id = $1
          AND id = $2
        FOR UPDATE`,
      [command.organizationId, command.userId],
    );

    // Inativado entre o guard e a trava: a sessao ja nao vale.
    if (!current || current.status !== 'active' || current.deletedAt) {
      return { kind: 'inactive' };
    }

    const changed = (Object.keys(command.patch) as Array<keyof OwnProfilePatch>)
      .filter((field) => command.patch[field] !== undefined)
      .filter((field) =>
        field === 'email'
          ? command.patch.email!.toLowerCase() !== current.email.toLowerCase()
          : command.patch[field] !== current[field],
      );

    if (changed.length === 0) {
      return { kind: 'unchanged' };
    }

    const emailChanged = changed.includes('email');

    // A senha conferida antes da transacao precisa ser a vigente.
    if (
      emailChanged &&
      (command.verifiedPasswordHash === null ||
        command.verifiedPasswordHash !== current.passwordHash)
    ) {
      return { kind: 'reauthentication_failed' };
    }

    const assignments = changed.map(
      (field, index) => `${PATCH_COLUMNS[field]} = $${index + 3}`,
    );

    await manager.query(
      `UPDATE users
          SET ${assignments.join(', ')}, updated_at = now()
        WHERE organization_id = $1
          AND id = $2`,
      [
        command.organizationId,
        command.userId,
        ...changed.map((field) => command.patch[field]),
      ],
    );

    const otherFields = changed.filter((field) => field !== 'email');

    if (otherFields.length > 0) {
      await this.audit(manager, command, 'profile.updated', {
        fields: otherFields,
      });
    }

    if (emailChanged) {
      // O link de recuperacao foi para o e-mail antigo: deixa de valer.
      await manager.query(
        `DELETE FROM password_reset_tokens
          WHERE user_id = $1
            AND organization_id = $2`,
        [command.userId, command.organizationId],
      );

      // Sem o endereco antigo nem o novo.
      await this.audit(manager, command, 'profile.email_changed', null);
    }

    return { kind: 'updated' };
  }

  private async audit(
    manager: EntityManager,
    command: UpdateOwnProfileCommand,
    action: string,
    afterValues: Record<string, unknown> | null,
  ): Promise<void> {
    await insertAuditEvent(manager, {
      organizationId: command.organizationId,
      actorUserId: command.userId,
      action,
      entityType: 'user',
      entityId: command.userId,
      afterValues,
      requestId: command.requestId,
    });
  }

  private translate(error: unknown): unknown {
    if (error instanceof DomainException || !isPostgresError(error)) {
      return error;
    }

    if (
      error.code === '23505' &&
      error.constraint === 'users_org_email_unique'
    ) {
      // Mesmo codigo do cadastro pelo admin; a orientacao de reativar nao
      // cabe a quem edita o proprio cadastro.
      return new DomainException({
        ...UserErrors.DUPLICATE_EMAIL,
        message: 'Este e-mail já está em uso na organização.',
        detail: `Violação de unicidade na constraint ${error.constraint}.`,
        fields: [{ field: 'email', code: 'DUPLICATE' }],
        cause: error,
      });
    }

    return translatePgError(error, 'users');
  }
}
