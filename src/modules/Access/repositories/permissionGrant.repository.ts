import type { EntityManager } from 'typeorm';

import { PERMISSION_LABELS, type PermissionName } from '../access.permissions';

/**
 * Garante as permissoes no catalogo global e as concede ao perfil. Idempotente:
 * permissao ou concessao ja existente nao duplica. O catalogo segue a matriz:
 * o rotulo e padronizado e o codigo excluido volta a valer. Concessao revogada
 * volta a valer, porque o par perfil/permissao e unico mesmo com `deleted_at`.
 */
export const grantPermissions = async (
  manager: EntityManager,
  organizationId: string,
  profileId: string,
  codes: readonly PermissionName[],
): Promise<void> => {
  for (const code of codes) {
    const rows = await manager.query<Array<{ id: string }>>(
      `INSERT INTO permissions (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL
       RETURNING id`,
      [code, PERMISSION_LABELS[code]],
    );

    await manager.query(
      `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`,
      [organizationId, profileId, rows[0].id],
    );
  }
};
