import { ProfileCode } from '@/common/context/requestContext.type';
import {
  PERMISSION_LABELS,
  PLATFORM_ADMIN_PERMISSIONS,
  Permissions,
  TENANT_PERMISSION_CODES,
  TENANT_PROFILES,
  TENANT_PROFILE_CODES,
  isPlatformPermission,
} from '@/modules/Access/access.permissions';

const sorted = (list: readonly string[]): string[] => [...list].sort();
const perms = (
  code:
    | ProfileCode.ADMIN
    | ProfileCode.PROFESSIONAL
    | ProfileCode.CAREGIVER
    | ProfileCode.FAMILY,
) => TENANT_PROFILES[code].permissions as readonly string[];

describe('matriz de permissoes dos perfis', () => {
  it('catalogo de tenant tem 36 codigos validos e rotulados', () => {
    expect(TENANT_PERMISSION_CODES).toHaveLength(36);
    expect(new Set(TENANT_PERMISSION_CODES).size).toBe(36);
    const all = Object.values(Permissions);
    expect(all).toHaveLength(40);
    for (const code of all) {
      expect(code).toMatch(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/);
      expect(PERMISSION_LABELS[code]).toBeTruthy();
    }
  });

  it('perfis na ordem de exibicao', () => {
    expect(TENANT_PROFILE_CODES).toEqual([
      'admin',
      'professional',
      'caregiver',
      'family',
    ]);
  });

  it('admin herda tudo do profissional e nao registra acompanhamento', () => {
    for (const code of perms(ProfileCode.PROFESSIONAL)) {
      expect(perms(ProfileCode.ADMIN)).toContain(code);
    }
    expect(perms(ProfileCode.ADMIN)).not.toContain('follow_ups:create');
  });

  it('so admin e profissional anulam registro de qualquer autor', () => {
    const holders = TENANT_PROFILE_CODES.filter((p) =>
      perms(p).includes('follow_ups:annul'),
    );
    expect(holders).toEqual(['admin', 'professional']);
  });

  it('somente o cuidador registra acompanhamento', () => {
    const holders = TENANT_PROFILE_CODES.filter((p) =>
      perms(p).includes('follow_ups:create'),
    );
    expect(holders).toEqual(['caregiver']);
  });

  it('todos os perfis, inclusive o master, gerenciam o proprio cadastro (BE-27)', () => {
    for (const p of TENANT_PROFILE_CODES) {
      expect(perms(p)).toContain('profile:manage');
    }
    expect(PLATFORM_ADMIN_PERMISSIONS).toContain('profile:manage');
  });

  it('familiar so tem leitura de dados de paciente', () => {
    for (const code of perms(ProfileCode.FAMILY).filter(
      (item) => item !== 'profile:manage',
    ))
      expect(code.endsWith(':read')).toBe(true);
    expect(sorted(perms(ProfileCode.FAMILY))).toEqual(
      sorted([
        'profile:manage',
        'patients:read',
        'patient_history:read',
        'patient_evolution:read',
        'alerts:read',
        'medications:read',
      ]),
    );
  });

  it('cuidador exatamente', () => {
    expect(sorted(perms(ProfileCode.CAREGIVER))).toEqual([
      'alerts:read',
      'alerts:resolve',
      'follow_ups:create',
      'forms:read',
      'medications:read',
      'patient_history:read',
      'patients:read',
      'profile:manage',
    ]);
  });

  it('profissional exatamente 21 codigos', () => {
    expect(sorted(perms(ProfileCode.PROFESSIONAL))).toEqual(
      sorted([
        'profile:manage',
        'patients:read',
        'patients:create',
        'patients:update',
        'patients:deactivate',
        'patient_history:read',
        'patient_evolution:read',
        'alerts:read',
        'alerts:resolve',
        'forms:read',
        'forms:create',
        'forms:update',
        'forms:deactivate',
        'alert_rules:manage',
        'follow_ups:annul',
        'medications:read',
        'medications:create',
        'medications:update',
        'medications:deactivate',
        'reports:generate',
        'patient_links:manage',
      ]),
    );
    expect(perms(ProfileCode.ADMIN)).toHaveLength(35);
    for (const code of [
      'organization:read',
      'organization:update',
      'users:read',
      'users:create',
      'users:update',
      'users:change_status',
      'users:change_profile',
      'users:reset_password',
      'access_profiles:read',
      'patient_links:manage',
      'plan:read',
      'plan_change_requests:create',
      'dashboard:read',
      'audit_events:read',
      'audit_events:export',
    ]) {
      expect(perms(ProfileCode.ADMIN)).toContain(code);
    }
  });

  it('uniao dos perfis cobre o catalogo de tenant', () => {
    const union = new Set<string>(
      TENANT_PROFILE_CODES.flatMap((p) => [...perms(p)]),
    );
    expect(sorted([...union])).toEqual(sorted(TENANT_PERMISSION_CODES));
  });

  it('nenhum perfil de tenant tem codigo de plataforma', () => {
    for (const p of TENANT_PROFILE_CODES) {
      for (const code of perms(p))
        expect(isPlatformPermission(code)).toBe(false);
    }
    expect(TENANT_PERMISSION_CODES.some(isPlatformPermission)).toBe(false);
  });

  it('master: plataforma e auditoria de todas as organizacoes (BE-23)', () => {
    expect(sorted(PLATFORM_ADMIN_PERMISSIONS)).toEqual(
      sorted([
        'profile:manage',
        'organization:read',
        'organization:update',
        'users:reset_password',
        'platform_organizations:create',
        'platform_organizations:read',
        'platform_organizations:update',
        'platform_organizations:change_status',
        'audit_events:read',
        'audit_events:export',
      ]),
    );
  });

  it('sem duplicata dentro de um perfil', () => {
    for (const p of TENANT_PROFILE_CODES) {
      expect(new Set(perms(p)).size).toBe(perms(p).length);
    }
  });
});
