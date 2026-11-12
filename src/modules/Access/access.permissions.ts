import { ProfileCode } from '@/common/context/requestContext.type';

/**
 * Catalogo de permissoes nomeadas e matriz dos quatro perfis fixos de tenant
 * (admin, professional, caregiver, family), decidida em 2026-10-29 (BE-05,
 * RF005/RF016, Figura 28). O admin herda o profissional, mas nao o cuidador:
 * so o cuidador registra acompanhamento. Desde o BE-10 (2026-11-04) o
 * profissional tambem gerencia vinculos com pacientes e, desde o BE-12, anula
 * registros de acompanhamento. Desde o BE-14 (2026-11-05) cuidador e familiar
 * consultam medicamentos dos pacientes vinculados e, desde o BE-17
 * (2026-11-06), cuidador e profissional resolvem alertas. Desde o BE-27
 * (2026-11-12) todos os perfis, inclusive o master, tem `profile:manage`, que
 * so alcanca o proprio cadastro. As quatro `platform_organizations:*` so valem
 * na organizacao de plataforma.
 */
export const Permissions = {
  PATIENTS_READ: 'patients:read',
  PATIENTS_CREATE: 'patients:create',
  PATIENTS_UPDATE: 'patients:update',
  PATIENTS_DEACTIVATE: 'patients:deactivate',
  PATIENT_HISTORY_READ: 'patient_history:read',
  PATIENT_EVOLUTION_READ: 'patient_evolution:read',
  ALERTS_READ: 'alerts:read',
  ALERTS_RESOLVE: 'alerts:resolve',
  FORMS_READ: 'forms:read',
  FORMS_CREATE: 'forms:create',
  FORMS_UPDATE: 'forms:update',
  FORMS_DEACTIVATE: 'forms:deactivate',
  ALERT_RULES_MANAGE: 'alert_rules:manage',
  FOLLOW_UPS_CREATE: 'follow_ups:create',
  FOLLOW_UPS_ANNUL: 'follow_ups:annul',
  MEDICATIONS_READ: 'medications:read',
  MEDICATIONS_CREATE: 'medications:create',
  MEDICATIONS_UPDATE: 'medications:update',
  MEDICATIONS_DEACTIVATE: 'medications:deactivate',
  REPORTS_GENERATE: 'reports:generate',
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_CHANGE_STATUS: 'users:change_status',
  USERS_CHANGE_PROFILE: 'users:change_profile',
  USERS_RESET_PASSWORD: 'users:reset_password',
  ACCESS_PROFILES_READ: 'access_profiles:read',
  PATIENT_LINKS_MANAGE: 'patient_links:manage',
  PLAN_READ: 'plan:read',
  PLAN_CHANGE_REQUESTS_CREATE: 'plan_change_requests:create',
  DASHBOARD_READ: 'dashboard:read',
  MANAGEMENT_REPORTS_GENERATE: 'management_reports:generate',
  AUDIT_EVENTS_READ: 'audit_events:read',
  AUDIT_EVENTS_EXPORT: 'audit_events:export',
  PROFILE_MANAGE: 'profile:manage',
  PLATFORM_ORGANIZATIONS_CREATE: 'platform_organizations:create',
  PLATFORM_ORGANIZATIONS_READ: 'platform_organizations:read',
  PLATFORM_ORGANIZATIONS_UPDATE: 'platform_organizations:update',
  PLATFORM_ORGANIZATIONS_CHANGE_STATUS: 'platform_organizations:change_status',
} as const;

export type PermissionName = (typeof Permissions)[keyof typeof Permissions];

export const PERMISSION_LABELS: Readonly<Record<PermissionName, string>> = {
  'patients:read': 'Consultar pacientes',
  'patients:create': 'Cadastrar pacientes',
  'patients:update': 'Editar pacientes',
  'patients:deactivate': 'Inativar e reativar pacientes',
  'patient_history:read': 'Consultar historico do paciente',
  'patient_evolution:read': 'Consultar evolucao do paciente',
  'alerts:read': 'Consultar alertas',
  'alerts:resolve': 'Resolver alertas',
  'forms:read': 'Consultar formularios',
  'forms:create': 'Criar formularios',
  'forms:update': 'Editar formularios',
  'forms:deactivate': 'Desativar e reativar formularios',
  'alert_rules:manage': 'Configurar regras de alerta',
  'follow_ups:create': 'Registrar acompanhamento',
  'follow_ups:annul': 'Anular registro de acompanhamento',
  'medications:read': 'Consultar medicamentos',
  'medications:create': 'Cadastrar medicamentos',
  'medications:update': 'Editar medicamentos',
  'medications:deactivate': 'Inativar medicamentos',
  'reports:generate': 'Gerar relatorio do paciente',
  'organization:read': 'Consultar a propria organizacao',
  'organization:update': 'Editar a propria organizacao',
  'users:read': 'Consultar usuarios',
  'users:create': 'Cadastrar usuarios',
  'users:update': 'Editar usuarios',
  'users:change_status': 'Inativar e reativar usuarios',
  'users:change_profile': 'Alterar perfil de usuario',
  'users:reset_password': 'Redefinir senha de usuario',
  'access_profiles:read': 'Consultar perfis de acesso',
  'patient_links:manage': 'Gerenciar vinculos com pacientes',
  'plan:read': 'Consultar plano e uso',
  'plan_change_requests:create': 'Solicitar alteracao de plano',
  'dashboard:read': 'Consultar painel operacional',
  'management_reports:generate': 'Gerar relatorios gerenciais',
  'audit_events:read': 'Consultar auditoria',
  'audit_events:export': 'Exportar auditoria',
  'profile:manage': 'Consultar e editar o proprio cadastro',
  'platform_organizations:create': 'Cadastrar organizacoes',
  'platform_organizations:read': 'Consultar qualquer organizacao',
  'platform_organizations:update': 'Editar qualquer organizacao',
  'platform_organizations:change_status': 'Inativar e reativar organizacoes',
};

/** So tem efeito em sessao da organizacao de plataforma. */
export const PLATFORM_PERMISSION_PREFIX = 'platform_';

export const isPlatformPermission = (code: string): boolean =>
  code.startsWith(PLATFORM_PERMISSION_PREFIX);

export type TenantProfileCode =
  | ProfileCode.ADMIN
  | ProfileCode.PROFESSIONAL
  | ProfileCode.CAREGIVER
  | ProfileCode.FAMILY;

const P = Permissions;

const FAMILY_PERMISSIONS: readonly PermissionName[] = [
  P.PROFILE_MANAGE,
  P.PATIENTS_READ,
  P.PATIENT_HISTORY_READ,
  P.PATIENT_EVOLUTION_READ,
  P.ALERTS_READ,
  P.MEDICATIONS_READ,
];

const CAREGIVER_PERMISSIONS: readonly PermissionName[] = [
  P.PROFILE_MANAGE,
  P.PATIENTS_READ,
  P.PATIENT_HISTORY_READ,
  P.ALERTS_READ,
  P.ALERTS_RESOLVE,
  P.FORMS_READ,
  P.FOLLOW_UPS_CREATE,
  P.MEDICATIONS_READ,
];

const PROFESSIONAL_PERMISSIONS: readonly PermissionName[] = [
  P.PROFILE_MANAGE,
  P.PATIENTS_READ,
  P.PATIENTS_CREATE,
  P.PATIENTS_UPDATE,
  P.PATIENTS_DEACTIVATE,
  P.PATIENT_HISTORY_READ,
  P.PATIENT_EVOLUTION_READ,
  P.ALERTS_READ,
  P.ALERTS_RESOLVE,
  P.FORMS_READ,
  P.FORMS_CREATE,
  P.FORMS_UPDATE,
  P.FORMS_DEACTIVATE,
  P.ALERT_RULES_MANAGE,
  P.FOLLOW_UPS_ANNUL,
  P.MEDICATIONS_READ,
  P.MEDICATIONS_CREATE,
  P.MEDICATIONS_UPDATE,
  P.MEDICATIONS_DEACTIVATE,
  P.REPORTS_GENERATE,
  P.PATIENT_LINKS_MANAGE,
];

const ADMINISTRATIVE_PERMISSIONS: readonly PermissionName[] = [
  P.ORGANIZATION_READ,
  P.ORGANIZATION_UPDATE,
  P.USERS_READ,
  P.USERS_CREATE,
  P.USERS_UPDATE,
  P.USERS_CHANGE_STATUS,
  P.USERS_CHANGE_PROFILE,
  P.USERS_RESET_PASSWORD,
  P.ACCESS_PROFILES_READ,
  P.PLAN_READ,
  P.PLAN_CHANGE_REQUESTS_CREATE,
  P.DASHBOARD_READ,
  P.MANAGEMENT_REPORTS_GENERATE,
  P.AUDIT_EVENTS_READ,
  P.AUDIT_EVENTS_EXPORT,
];

/** Heranca da Figura 28: admin = profissional + administrativas. */
const ADMIN_PERMISSIONS: readonly PermissionName[] = [
  ...PROFESSIONAL_PERMISSIONS,
  ...ADMINISTRATIVE_PERMISSIONS,
];

/** Ordem das chaves = ordem de exibicao. */
export const TENANT_PROFILES: Readonly<
  Record<
    TenantProfileCode,
    {
      name: string;
      description: string;
      permissions: readonly PermissionName[];
    }
  >
> = {
  [ProfileCode.ADMIN]: {
    name: 'Administrador',
    description: 'Administrador da organizacao',
    permissions: ADMIN_PERMISSIONS,
  },
  [ProfileCode.PROFESSIONAL]: {
    name: 'Profissional de saude',
    description: 'Profissional de saude responsavel pelo acompanhamento',
    permissions: PROFESSIONAL_PERMISSIONS,
  },
  [ProfileCode.CAREGIVER]: {
    name: 'Cuidador',
    description: 'Cuidador que registra o acompanhamento',
    permissions: CAREGIVER_PERMISSIONS,
  },
  [ProfileCode.FAMILY]: {
    name: 'Familiar',
    description: 'Familiar com acesso somente leitura',
    permissions: FAMILY_PERMISSIONS,
  },
};

export const TENANT_PROFILE_CODES: readonly TenantProfileCode[] = Object.keys(
  TENANT_PROFILES,
) as TenantProfileCode[];

/** Os 37 codigos de tenant (sem `platform_*`). */
export const TENANT_PERMISSION_CODES: readonly PermissionName[] = (
  Object.values(Permissions) as PermissionName[]
).filter((code) => !isPlatformPermission(code));

export const PLATFORM_ADMIN_PERMISSIONS: readonly PermissionName[] = [
  Permissions.PROFILE_MANAGE,
  Permissions.USERS_RESET_PASSWORD,
  Permissions.ORGANIZATION_READ,
  Permissions.ORGANIZATION_UPDATE,
  Permissions.PLATFORM_ORGANIZATIONS_CREATE,
  Permissions.PLATFORM_ORGANIZATIONS_READ,
  Permissions.PLATFORM_ORGANIZATIONS_UPDATE,
  Permissions.PLATFORM_ORGANIZATIONS_CHANGE_STATUS,
  Permissions.AUDIT_EVENTS_READ,
  Permissions.AUDIT_EVENTS_EXPORT,
];
