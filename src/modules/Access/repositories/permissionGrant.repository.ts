import type { EntityManager } from 'typeorm';

import { PERMISSION_LABELS, type PermissionName } from '../access.permissions';

/**
 * Garante as permissoes no catalogo global e as concede ao perfil. Idempotente:
 * permissao ou concessao ja existente nao duplica.
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
       ON CONFLICT (code) DO UPDATE SET name = permissions.name
       RETURNING id`,
      [code, PERMISSION_LABELS[code]],
    );

    await manager.query(
      `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [organizationId, profileId, rows[0].id],
    );
  }
};
