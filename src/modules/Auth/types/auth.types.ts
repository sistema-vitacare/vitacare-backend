import { ProfileCode } from '@/common/context/requestContext.type';

export interface LoginIdentity {
  userId: string;
  organizationId: string;
  passwordHash: string | null;
  mustChangePassword: boolean;
  status: 'pending' | 'active' | 'inactive';
  deletedAt: Date | null;
  organizationStatus: 'active' | 'inactive';
  organizationDeletedAt: Date | null;
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
  profile: ProfileCode;
  permissions: ReadonlySet<string>;
  absoluteExpiresAt: Date;
}
