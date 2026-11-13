import {
  type OrganizationKind,
  ProfileCode,
} from '@/common/context/requestContext.type';
import type { PlanSummary } from '@/modules/Plan/repositories/planSummary.query';

export interface LoginIdentity {
  userId: string;
  organizationId: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
  status: 'pending' | 'active' | 'inactive';
  deletedAt: Date | null;
  organizationStatus: 'active' | 'inactive';
  organizationDeletedAt: Date | null;
  /** Prazo da senha emitida pela redefinicao administrativa; `null` sem prazo. */
  temporaryPasswordExpiresAt: Date | null;
  profile: ProfileCode;
  permissions: ReadonlySet<string>;
}

/**
 * Resultado da busca feita no login e na solicitacao de recuperacao. A
 * organizacao e resolvida pelo codigo mesmo quando a conta nao existe: sem ela
 * a tentativa falha nao teria onde ser auditada, e uma consulta extra apenas
 * no caminho da falha revelaria pelo tempo se a conta existe.
 */
export interface AuthLookup {
  /** `null` quando nenhuma organizacao usa o codigo informado. */
  organizationId: string | null;
  /** `null` quando a organizacao existe mas o e-mail nao pertence a ela. */
  identity: LoginIdentity | null;
}

export interface AuthenticatedPrincipal {
  sessionId: string;
  sessionType: 'normal' | 'password_change';
  userId: string;
  organizationId: string;
  organizationKind: OrganizationKind;
  profile: ProfileCode;
  permissions: ReadonlySet<string>;
  absoluteExpiresAt: Date;
  /**
   * Aceitou a versao vigente do termo de uso, ou nao ha versao publicada
   * (BE-32). Sem aceite, a sessao normal so alcanca as rotas liberadas.
   */
  termsAccepted: boolean;
}

/**
 * Dados da sessao do usuario (BE-27): mesma leitura no login e em `/profile`.
 * `permissions` vem da mesma consulta que o guard usa.
 */
export interface SessionProfileRow {
  user: {
    id: string;
    name: string;
    email: string;
    cpf: string;
    phone: string | null;
    status: 'pending' | 'active' | 'inactive';
    createdAt: Date;
  };
  profile: { code: ProfileCode; name: string };
  permissions: string[];
  organization: {
    id: string;
    code: string;
    tradeName: string;
    legalName: string | null;
    kind: OrganizationKind;
    status: 'active' | 'inactive';
    plan: PlanSummary | null;
  };
  /** Vigente = maior versao publicada; aceita = maior versao aceita (BE-32). */
  terms: { currentVersion: number | null; acceptedVersion: number | null };
}
