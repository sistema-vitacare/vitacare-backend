/** Perfis de acesso do VitaCare. Os valores finais dependem de RF005/RF016. */
export enum ProfileCode {
  PLATFORM_ADMIN = 'platform_admin',
  ADMIN = 'admin',
  PROFESSIONAL = 'professional',
  CAREGIVER = 'caregiver',
  FAMILY = 'family',
}

/** `platform` e a organizacao unica dos administradores master. */
export type OrganizationKind = 'tenant' | 'platform';

/** Permissao nomeada no formato `recurso:acao`. O catalogo fecha na tarefa 4 do backlog. */
export type PermissionCode = string;

/**
 * Identidade efetiva da requisicao. `organizationId` vem sempre do token
 * autenticado, nunca do corpo, da query ou de um parametro de rota.
 */
export interface RequestContext {
  readonly requestId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationKind: OrganizationKind;
  readonly profile: ProfileCode;
  readonly permissions: ReadonlySet<PermissionCode>;
}
