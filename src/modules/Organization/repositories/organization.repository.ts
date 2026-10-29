import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import type { RequestContext } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { translatePgError } from '@/common/errors/pgError.translator';
import { TENANT_ADMIN_PERMISSIONS } from '@/modules/Access/access.permissions';
import { grantPermissions } from '@/modules/Access/repositories/permissionGrant.repository';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';

import {
  Organization,
  type OrganizationStatus,
} from '../entities/organization.entity';
import { OrganizationErrors } from '../organization.errors';
import { canReachOrganization } from '../policies/organization.policy';
import type {
  NewOrganizationRecord,
  OrganizationActor,
  OrganizationListFilters,
  OrganizationPatch,
} from '../types/organization.types';

type WriteResult = [unknown, number];

interface PostgresError {
  code: string;
  constraint?: string;
}

interface ConflictMapping {
  error: { code: string; status: number; message: string };
  field: string;
}

const CONFLICT_BY_CONSTRAINT: Readonly<Record<string, ConflictMapping>> = {
  organizations_code_unique: {
    error: OrganizationErrors.CODE_TAKEN,
    field: 'code',
  },
  organizations_document_normalized_unique: {
    error: OrganizationErrors.DOCUMENT_TAKEN,
    field: 'document',
  },
};

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

export interface CreatedOrganization {
  organization: Organization;
  administratorId: string;
}

/**
 * Organizacao e o proprio tenant, entao nao cabe no `TenantScopedRepository`.
 * O escopo e aplicado aqui: fora da plataforma, so a organizacao da sessao e
 * alcancavel, e a listagem nunca inclui a organizacao de plataforma.
 */
@Injectable()
export class OrganizationRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findReachable(
    ctx: RequestContext,
    organizationId: string,
  ): Promise<Organization | null> {
    if (!canReachOrganization(ctx, organizationId)) {
      return null;
    }

    return this.dataSource.manager.findOne(Organization, {
      where: { id: organizationId },
    });
  }

  async list(
    filters: OrganizationListFilters,
  ): Promise<[Organization[], number]> {
    const query = this.dataSource.manager
      .createQueryBuilder(Organization, 'organization')
      .where("organization.kind = 'tenant'")
      .orderBy('organization.trade_name', 'ASC')
      .addOrderBy('organization.id', 'ASC')
      .skip(filters.skip)
      .take(filters.take);

    if (filters.status) {
      query.andWhere('organization.status = :status', {
        status: filters.status,
      });
    }

    if (filters.search) {
      query.andWhere(
        `(organization.trade_name ILIKE :search
          OR organization.legal_name ILIKE :search
          OR organization.code ILIKE :search)`,
        { search: `%${escapeLike(filters.search)}%` },
      );
    }

    return query.getManyAndCount();
  }

  async create(
    record: NewOrganizationRecord,
    actor: OrganizationActor,
  ): Promise<CreatedOrganization> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertPlanAvailable(manager, record.usagePlanId);

        const [{ id: organizationId }] = await manager.query<
          Array<{ id: string }>
        >(
          `INSERT INTO organizations
             (kind, code, usage_plan_id, trade_name, legal_name, document, phone, email)
           VALUES ('tenant', $1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            record.code,
            record.usagePlanId,
            record.tradeName,
            record.legalName,
            record.document,
            record.phone,
            record.email,
          ],
        );

        const [{ id: profileId }] = await manager.query<Array<{ id: string }>>(
          `INSERT INTO access_profiles (organization_id, code, name, description)
           VALUES ($1, 'admin', 'Administrador', 'Perfil inicial criado com a organizacao')
           RETURNING id`,
          [organizationId],
        );

        await grantPermissions(
          manager,
          organizationId,
          profileId,
          TENANT_ADMIN_PERMISSIONS,
        );

        const { administrator } = record;

        const [{ id: administratorId }] = await manager.query<
          Array<{ id: string }>
        >(
          `INSERT INTO users
             (organization_id, profile_id, name, email, cpf, phone, password_hash, status, must_change_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', true)
           RETURNING id`,
          [
            organizationId,
            profileId,
            administrator.name,
            administrator.email,
            administrator.cpf,
            administrator.phone,
            administrator.passwordHash,
          ],
        );

        await this.audit(
          manager,
          actor,
          organizationId,
          'organization.created',
        );

        await insertAuditEvent(manager, {
          organizationId,
          actorUserId: null,
          action: 'user.created',
          entityType: 'user',
          entityId: administratorId,
          afterValues: { reason: 'first_administrator' },
          requestId: actor.requestId,
        });

        const organization = await manager.findOneOrFail(Organization, {
          where: { id: organizationId },
        });

        return { organization, administratorId };
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(
    organizationId: string,
    patch: OrganizationPatch,
    actor: OrganizationActor,
  ): Promise<Organization | null> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const result = await manager.update(
          Organization,
          { id: organizationId },
          { ...patch, updatedAt: () => 'now()' },
        );

        if (result.affected !== 1) {
          return null;
        }

        await this.audit(
          manager,
          actor,
          organizationId,
          'organization.updated',
          {
            changedFields: Object.keys(patch).sort(),
          },
        );

        return manager.findOneOrFail(Organization, {
          where: { id: organizationId },
        });
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * A transicao so acontece a partir do estado lido pelo caso de uso. Inativar
   * revoga na mesma transacao as sessoes e os links de recuperacao pendentes
   * de todos os usuarios da organizacao.
   */
  async changeStatus(
    organizationId: string,
    from: OrganizationStatus,
    to: OrganizationStatus,
    actor: OrganizationActor,
  ): Promise<Organization | null> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const changed = await manager.query<WriteResult>(
          `UPDATE organizations
              SET status = $3::varchar,
                  deleted_at = CASE WHEN $3::varchar = 'inactive' THEN now() ELSE NULL END,
                  updated_at = now()
            WHERE id = $1
              AND status = $2::varchar
              AND kind = 'tenant'`,
          [organizationId, from, to],
        );

        if (changed[1] !== 1) {
          return null;
        }

        if (to === 'inactive') {
          await this.revokeAccess(manager, organizationId);
        }

        await this.audit(
          manager,
          actor,
          organizationId,
          to === 'inactive'
            ? 'organization.deactivated'
            : 'organization.reactivated',
        );

        return manager.findOneOrFail(Organization, {
          where: { id: organizationId },
        });
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  private async assertPlanAvailable(
    manager: EntityManager,
    usagePlanId: string,
  ): Promise<void> {
    const plans = await manager.query<Array<{ id: string }>>(
      `SELECT id
         FROM usage_plans
        WHERE id = $1
          AND status = true
          AND deleted_at IS NULL`,
      [usagePlanId],
    );

    if (!plans[0]) {
      throw new DomainException({
        ...OrganizationErrors.PLAN_NOT_FOUND,
        detail: 'Plano inexistente, inativo ou excluído.',
        fields: [{ field: 'usagePlanId', code: 'NOT_FOUND' }],
      });
    }
  }

  private async revokeAccess(
    manager: EntityManager,
    organizationId: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE auth_sessions
          SET revoked_at = now(), revoked_reason = 'organization_deactivated', updated_at = now()
        WHERE organization_id = $1
          AND revoked_at IS NULL
          AND deleted_at IS NULL`,
      [organizationId],
    );

    await manager.query(
      `UPDATE password_reset_tokens
          SET revoked_at = now(), updated_at = now()
        WHERE organization_id = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL`,
      [organizationId],
    );
  }

  /**
   * O evento fica na organizacao alvo e, quando quem age e a plataforma, tambem
   * na organizacao do ator: a FK de autoria nao aceita autor de outro tenant,
   * entao no alvo ele entra como evento de sistema.
   */
  private async audit(
    manager: EntityManager,
    actor: OrganizationActor,
    organizationId: string,
    action: string,
    afterValues: Record<string, unknown> | null = null,
  ): Promise<void> {
    const sameOrganization = actor.organizationId === organizationId;

    await insertAuditEvent(manager, {
      organizationId,
      actorUserId: sameOrganization ? actor.userId : null,
      action,
      entityType: 'organization',
      entityId: organizationId,
      afterValues: sameOrganization
        ? afterValues
        : { ...afterValues, platformActorUserId: actor.userId },
      requestId: actor.requestId,
    });

    if (!sameOrganization) {
      await insertAuditEvent(manager, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action,
        entityType: 'organization',
        entityId: organizationId,
        afterValues,
        requestId: actor.requestId,
      });
    }
  }

  private translate(error: unknown): unknown {
    if (error instanceof DomainException || !isPostgresError(error)) {
      return error;
    }

    const conflict =
      error.code === '23505' && error.constraint
        ? CONFLICT_BY_CONSTRAINT[error.constraint]
        : undefined;

    if (conflict) {
      return new DomainException({
        ...conflict.error,
        detail: `Violação de unicidade na constraint ${error.constraint}.`,
        fields: [{ field: conflict.field, code: 'DUPLICATE' }],
        cause: error,
      });
    }

    return translatePgError(error, 'organizations');
  }
}
