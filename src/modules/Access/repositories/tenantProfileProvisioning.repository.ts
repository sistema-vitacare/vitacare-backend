import type { EntityManager } from 'typeorm';

import {
  TENANT_PROFILES,
  TENANT_PROFILE_CODES,
  type TenantProfileCode,
} from '../access.permissions';
import { grantPermissions } from './permissionGrant.repository';

/**
 * Deixa os quatro perfis fixos da organizacao cliente exatamente iguais a
 * matriz (BE-05): cria ou reaproveita cada perfil, padroniza nome e descricao,
 * limpa `deleted_at`, concede o que falta e revoga (`deleted_at = now()`) as
 * concessoes que sobram, sem apaga-las. Idempotente; so toca a organizacao
 * informada. Roda na transacao de quem chama.
 */
export const provisionTenantProfiles = async (
  manager: EntityManager,
  organizationId: string,
): Promise<Record<TenantProfileCode, string>> => {
  const profileIds = {} as Record<TenantProfileCode, string>;

  for (const code of TENANT_PROFILE_CODES) {
    const profile = TENANT_PROFILES[code];

    const [{ id: profileId }] = await manager.query<Array<{ id: string }>>(
      `INSERT INTO access_profiles (organization_id, code, name, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, code) DO UPDATE
          SET name = EXCLUDED.name,
              description = EXCLUDED.description,
              deleted_at = NULL,
              updated_at = now()
       RETURNING id`,
      [organizationId, code, profile.name, profile.description],
    );

    await grantPermissions(
      manager,
      organizationId,
      profileId,
      profile.permissions,
    );

    await manager.query(
      `UPDATE profile_permissions pp
          SET deleted_at = now()
         FROM permissions p
        WHERE p.id = pp.permission_id
          AND pp.profile_id = $1
          AND pp.organization_id = $2
          AND pp.deleted_at IS NULL
          AND NOT (p.code = ANY($3::text[]))`,
      [profileId, organizationId, [...profile.permissions]],
    );

    profileIds[code] = profileId;
  }

  return profileIds;
};
