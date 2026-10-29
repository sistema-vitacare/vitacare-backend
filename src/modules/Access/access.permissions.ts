/**
 * Catalogo de permissoes nomeadas. A matriz completa por perfil fecha na
 * tarefa 4 (RF005/RF016); aqui ficam apenas as permissoes ja usadas por rota.
 */
export const Permissions = {
  USERS_RESET_PASSWORD: 'users:reset_password',
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',
  PLATFORM_ORGANIZATIONS_CREATE: 'platform_organizations:create',
  PLATFORM_ORGANIZATIONS_READ: 'platform_organizations:read',
  PLATFORM_ORGANIZATIONS_UPDATE: 'platform_organizations:update',
  PLATFORM_ORGANIZATIONS_CHANGE_STATUS: 'platform_organizations:change_status',
} as const;

export type PermissionName = (typeof Permissions)[keyof typeof Permissions];

export const PERMISSION_LABELS: Readonly<Record<PermissionName, string>> = {
  'users:reset_password': 'Redefinir senha de usuario',
  'organization:read': 'Consultar a propria organizacao',
  'organization:update': 'Editar a propria organizacao',
  'platform_organizations:create': 'Cadastrar organizacoes',
  'platform_organizations:read': 'Consultar qualquer organizacao',
  'platform_organizations:update': 'Editar qualquer organizacao',
  'platform_organizations:change_status': 'Inativar e reativar organizacoes',
};

/** So tem efeito em sessao da organizacao de plataforma. */
export const PLATFORM_PERMISSION_PREFIX = 'platform_';

export const isPlatformPermission = (code: string): boolean =>
  code.startsWith(PLATFORM_PERMISSION_PREFIX);

export const TENANT_ADMIN_PERMISSIONS: readonly PermissionName[] = [
  Permissions.USERS_RESET_PASSWORD,
  Permissions.ORGANIZATION_READ,
  Permissions.ORGANIZATION_UPDATE,
];

export const PLATFORM_ADMIN_PERMISSIONS: readonly PermissionName[] = [
  ...TENANT_ADMIN_PERMISSIONS,
  Permissions.PLATFORM_ORGANIZATIONS_CREATE,
  Permissions.PLATFORM_ORGANIZATIONS_READ,
  Permissions.PLATFORM_ORGANIZATIONS_UPDATE,
  Permissions.PLATFORM_ORGANIZATIONS_CHANGE_STATUS,
];
