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

/** A vigente existe e nao e a maior aceita (as versoes so crescem). */
export const termsAcceptanceRequired = (terms: SessionProfileRow['terms']) =>
  terms.currentVersion !== null &&
  terms.acceptedVersion !== terms.currentVersion;

export const toSessionProfileResponse = (
  row: SessionProfileRow,
  options: SessionProfileOptions,
): SessionProfileDto => {
  const termsRequired = termsAcceptanceRequired(row.terms);

  return {
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
    // Sem o aceite do termo vigente, nada e autorizado alem de aceitar (BE-32).
    permissions:
      options.restricted || termsRequired ? [] : [...row.permissions].sort(),
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
    terms: {
      required: termsRequired,
      currentVersion: row.terms.currentVersion,
      acceptedVersion: row.terms.acceptedVersion,
    },
  };
};
