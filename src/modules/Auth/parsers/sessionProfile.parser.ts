import { maskCpf } from '@/modules/User/parsers/user.parser';

import type { SessionProfileDto } from '../dtos/sessionProfile.dto';
import type { SessionProfileRow } from '../types/auth.types';

export interface SessionProfileOptions {
  /**
   * `masked` no login (minimizacao, decisao de Mateus em 2026-11-12); `full`
   * em `/profile`, que e dado do proprio titular.
   */
  cpf: 'masked' | 'full';
  /** Sessao restrita do primeiro acesso: identifica, mas nao autoriza nada. */
  restricted: boolean;
}

export const toSessionProfileResponse = (
  row: SessionProfileRow,
  options: SessionProfileOptions,
): SessionProfileDto => ({
  user: {
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    cpf: options.cpf === 'masked' ? maskCpf(row.user.cpf) : row.user.cpf,
    phone: row.user.phone,
    status: row.user.status,
    createdAt: row.user.createdAt.toISOString(),
  },
  profile: { code: row.profile.code, name: row.profile.name },
  permissions: options.restricted ? [] : [...row.permissions].sort(),
  organization: {
    id: row.organization.id,
    code: row.organization.code,
    name: row.organization.tradeName,
    legalName: row.organization.legalName,
    kind: row.organization.kind,
    status: row.organization.status,
    plan: row.organization.plan
      ? {
          code: row.organization.plan.code,
          name: row.organization.plan.name,
          features: [...row.organization.plan.features],
          termStatus: row.organization.plan.termStatus,
        }
      : null,
  },
});
