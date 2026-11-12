import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { OrganizationKind } from '@/common/context/requestContext.type';
import { readPlanSummary } from '@/modules/Plan/repositories/planSummary.query';

import type {
  AuthLookup,
  LoginIdentity,
  SessionProfileRow,
} from '../types/auth.types';
import { loadEffectivePermissions } from './effectivePermissions.query';

/** Linha crua da busca: a organizacao sempre vem, a conta pode faltar. */
interface LookupRow extends Omit<LoginIdentity, 'permissions' | 'userId'> {
  userId: string | null;
}

interface SessionUserRow {
  userId: string;
  name: string;
  email: string;
  cpf: string;
  phone: string | null;
  status: SessionProfileRow['user']['status'];
  createdAt: Date;
  profileId: string;
  profileCode: SessionProfileRow['profile']['code'];
  profileName: string;
  organizationId: string;
  organizationCode: string;
  tradeName: string;
  legalName: string | null;
  organizationKind: OrganizationKind;
  organizationStatus: SessionProfileRow['organization']['status'];
}

/**
 * Leitura de identidade para autenticacao. E o unico ponto que consulta um
 * usuario sem organizacao no contexto: no login a organizacao ainda esta sendo
 * descoberta pelo codigo enviado, e o par organizacao/e-mail e sempre exigido.
 */
@Injectable()
export class AuthIdentityRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Parte da organizacao e chega na conta por juncao a esquerda, em uma unica
   * consulta. Assim o chamador sabe a organizacao mesmo quando o e-mail nao
   * existe — a tentativa falha precisa disso para ser auditada — sem que o
   * caminho da conta inexistente gaste uma consulta a mais que o da existente.
   */
  async findForAuthentication(
    organizationCode: string,
    email: string,
  ): Promise<AuthLookup> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select('organization.id', 'organizationId')
      .addSelect('organization.status', 'organizationStatus')
      .addSelect('organization.deleted_at', 'organizationDeletedAt')
      .addSelect('user.id', 'userId')
      .addSelect('user.password_hash', 'passwordHash')
      .addSelect('user.must_change_password', 'mustChangePassword')
      .addSelect(
        'user.temporary_password_expires_at',
        'temporaryPasswordExpiresAt',
      )
      .addSelect('user.status', 'status')
      .addSelect('user.deleted_at', 'deletedAt')
      .addSelect('profile.code', 'profile')
      .from('organizations', 'organization')
      .leftJoin(
        'users',
        'user',
        'user.organization_id = organization.id AND user.email = :email',
        { email },
      )
      .leftJoin(
        'access_profiles',
        'profile',
        'profile.id = user.profile_id AND profile.organization_id = user.organization_id',
      )
      .where('organization.code = :organizationCode', { organizationCode })
      .getRawOne<LookupRow>();

    if (!row) {
      return { organizationId: null, identity: null };
    }

    if (row.userId === null) {
      return { organizationId: row.organizationId, identity: null };
    }

    // Permissoes so sao necessarias na sessao ja estabelecida; o login decide
    // apenas se a credencial vale.
    return {
      organizationId: row.organizationId,
      identity: { ...row, userId: row.userId, permissions: new Set() },
    };
  }

  async findPasswordHash(
    userId: string,
    organizationId: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query<
      Array<{ passwordHash: string | null }>
    >(
      `SELECT password_hash AS "passwordHash"
         FROM users
        WHERE id = $1
          AND organization_id = $2
          AND status IN ('pending', 'active')
          AND deleted_at IS NULL`,
      [userId, organizationId],
    );

    return rows[0]?.passwordHash ?? null;
  }

  /**
   * Bloco de sessao do usuario (BE-27), lido depois do login aceito e em
   * `/profile`. Nao filtra situacao: quem chama ja autenticou o usuario. As
   * permissoes saem da mesma consulta do guard.
   */
  async findSessionProfile(
    userId: string,
    organizationId: string,
  ): Promise<SessionProfileRow | null> {
    const [row] = await this.dataSource.query<SessionUserRow[]>(
      `SELECT u.id AS "userId",
              u.name,
              u.email,
              u.cpf,
              u.phone,
              u.status,
              u.created_at AS "createdAt",
              p.id AS "profileId",
              p.code AS "profileCode",
              p.name AS "profileName",
              o.id AS "organizationId",
              o.code AS "organizationCode",
              o.trade_name AS "tradeName",
              o.legal_name AS "legalName",
              o.kind AS "organizationKind",
              o.status AS "organizationStatus"
         FROM users u
         JOIN access_profiles p
           ON p.id = u.profile_id
          AND p.organization_id = u.organization_id
         JOIN organizations o ON o.id = u.organization_id
        WHERE u.id = $1
          AND u.organization_id = $2`,
      [userId, organizationId],
    );

    if (!row) {
      return null;
    }

    const [permissions, plan] = await Promise.all([
      loadEffectivePermissions(
        this.dataSource,
        row.profileId,
        row.organizationId,
        row.organizationKind,
      ),
      readPlanSummary(this.dataSource, row.organizationId),
    ]);

    return {
      user: {
        id: row.userId,
        name: row.name,
        email: row.email,
        cpf: row.cpf,
        phone: row.phone,
        status: row.status,
        createdAt: row.createdAt,
      },
      profile: { code: row.profileCode, name: row.profileName },
      permissions,
      organization: {
        id: row.organizationId,
        code: row.organizationCode,
        tradeName: row.tradeName,
        legalName: row.legalName,
        kind: row.organizationKind,
        status: row.organizationStatus,
        plan,
      },
    };
  }
}
