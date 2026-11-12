import type { EntityManager } from 'typeorm';

import { isPlatformPermission } from '@/modules/Access/access.permissions';

import type { OrganizationKind } from '@/common/context/requestContext.type';

interface PermissionRow {
  code: string;
}

/**
 * Permissoes efetivas de um perfil: as concessoes vigentes de
 * `profile_permissions`, sem as `platform_*` fora da organizacao de plataforma.
 * E a unica fonte do guard e do bloco de sessao do login e do `/profile`
 * (BE-27): o que a sessao informa e exatamente o que o guard autoriza.
 */
export const loadEffectivePermissions = async (
  executor: Pick<EntityManager, 'query'>,
  profileId: string,
  organizationId: string,
  organizationKind: OrganizationKind,
): Promise<string[]> => {
  const rows = await executor.query<PermissionRow[]>(
    `SELECT permission.code
       FROM profile_permissions pp
       JOIN permissions permission ON permission.id = pp.permission_id
      WHERE pp.profile_id = $1
        AND pp.organization_id = $2
        AND pp.deleted_at IS NULL
        AND permission.deleted_at IS NULL`,
    [profileId, organizationId],
  );

  const isPlatform = organizationKind === 'platform';

  // Permissao de plataforma concedida a perfil de tenant nao vale nada.
  return rows
    .map((row) => row.code)
    .filter((code) => isPlatform || !isPlatformPermission(code));
};
