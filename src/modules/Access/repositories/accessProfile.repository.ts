import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { RequestContext } from '@/common/context/requestContext.type';

export interface AccessProfilePermissionRecord {
  code: string;
  name: string;
}

export interface AccessProfileRecord {
  code: string;
  name: string;
  description: string | null;
  permissions: AccessProfilePermissionRecord[];
}

interface AccessProfileRow {
  profileId: string;
  code: string;
  name: string;
  description: string | null;
  permissionCode: string | null;
  permissionName: string | null;
}

/**
 * Leitura do catalogo de perfis da organizacao da sessao (BE-05, UC03 passo 3).
 * Sempre escopada por `ctx.organizationId`; perfil, concessao e permissao com
 * `deleted_at` ficam de fora. Perfil sem permissao viva aparece com lista vazia.
 * Permissoes saem ordenadas por codigo em ordem binaria (`COLLATE "C"`).
 */
@Injectable()
export class AccessProfileRepository {
  constructor(private readonly dataSource: DataSource) {}

  async listLiveWithPermissions(
    ctx: RequestContext,
  ): Promise<AccessProfileRecord[]> {
    const rows = await this.dataSource.query<AccessProfileRow[]>(
      `SELECT profile.id AS "profileId",
              profile.code,
              profile.name,
              profile.description,
              permission.code AS "permissionCode",
              permission.name AS "permissionName"
         FROM access_profiles profile
         LEFT JOIN profile_permissions grant_row
                ON grant_row.profile_id = profile.id
               AND grant_row.organization_id = profile.organization_id
               AND grant_row.deleted_at IS NULL
         LEFT JOIN permissions permission
                ON permission.id = grant_row.permission_id
               AND permission.deleted_at IS NULL
        WHERE profile.organization_id = $1
          AND profile.deleted_at IS NULL
        ORDER BY profile.code COLLATE "C",
                 permission.code COLLATE "C" NULLS LAST`,
      [ctx.organizationId],
    );

    const byProfile = new Map<string, AccessProfileRecord>();

    for (const row of rows) {
      let profile = byProfile.get(row.profileId);

      if (!profile) {
        profile = {
          code: row.code,
          name: row.name,
          description: row.description,
          permissions: [],
        };
        byProfile.set(row.profileId, profile);
      }

      if (row.permissionCode !== null && row.permissionName !== null) {
        profile.permissions.push({
          code: row.permissionCode,
          name: row.permissionName,
        });
      }
    }

    return [...byProfile.values()];
  }
}
