import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalogo de permissoes de tenant (codigo, rotulo) da matriz do BE-05,
 * congelado em 2026-10-30. Migration nao importa codigo da aplicacao: se a
 * matriz mudar depois, a mudanca entra em migration nova.
 */
const TENANT_PERMISSIONS: ReadonlyArray<readonly [string, string]> = [
  ['patients:read', 'Consultar pacientes'],
  ['patients:create', 'Cadastrar pacientes'],
  ['patients:update', 'Editar pacientes'],
  ['patients:deactivate', 'Inativar pacientes'],
  ['patient_history:read', 'Consultar historico do paciente'],
  ['patient_evolution:read', 'Consultar evolucao do paciente'],
  ['alerts:read', 'Consultar alertas'],
  ['forms:read', 'Consultar formularios'],
  ['forms:create', 'Criar formularios'],
  ['forms:update', 'Editar formularios'],
  ['forms:deactivate', 'Desativar formularios'],
  ['alert_rules:manage', 'Configurar regras de alerta'],
  ['follow_ups:create', 'Registrar acompanhamento'],
  ['medications:read', 'Consultar medicamentos'],
  ['medications:create', 'Cadastrar medicamentos'],
  ['medications:update', 'Editar medicamentos'],
  ['medications:deactivate', 'Inativar medicamentos'],
  ['reports:generate', 'Gerar relatorio do paciente'],
  ['organization:read', 'Consultar a propria organizacao'],
  ['organization:update', 'Editar a propria organizacao'],
  ['users:read', 'Consultar usuarios'],
  ['users:create', 'Cadastrar usuarios'],
  ['users:update', 'Editar usuarios'],
  ['users:change_status', 'Inativar e reativar usuarios'],
  ['users:change_profile', 'Alterar perfil de usuario'],
  ['users:reset_password', 'Redefinir senha de usuario'],
  ['access_profiles:read', 'Consultar perfis de acesso'],
  ['patient_links:manage', 'Gerenciar vinculos com pacientes'],
  ['plan:read', 'Consultar plano e uso'],
  ['plan_change_requests:create', 'Solicitar alteracao de plano'],
  ['dashboard:read', 'Consultar painel operacional'],
  ['audit_events:read', 'Consultar auditoria'],
  ['audit_events:export', 'Exportar auditoria'],
];

/** Codigos de tenant que ja existiam antes desta migration; o `down` os mantem. */
const LEGACY_TENANT_CODES: readonly string[] = [
  'organization:read',
  'organization:update',
  'users:reset_password',
];

/** Os quatro perfis fixos de tenant: codigo, nome e descricao. */
const TENANT_PROFILES: ReadonlyArray<readonly [string, string, string]> = [
  ['admin', 'Administrador', 'Administrador da organizacao'],
  [
    'professional',
    'Profissional de saude',
    'Profissional de saude responsavel pelo acompanhamento',
  ],
  ['caregiver', 'Cuidador', 'Cuidador que registra o acompanhamento'],
  ['family', 'Familiar', 'Familiar com acesso somente leitura'],
];

const FAMILY = [
  'patients:read',
  'patient_history:read',
  'patient_evolution:read',
  'alerts:read',
];

const CAREGIVER = [
  'patients:read',
  'patient_history:read',
  'alerts:read',
  'forms:read',
  'follow_ups:create',
];

const PROFESSIONAL = [
  'patients:read',
  'patients:create',
  'patients:update',
  'patients:deactivate',
  'patient_history:read',
  'patient_evolution:read',
  'alerts:read',
  'forms:read',
  'forms:create',
  'forms:update',
  'forms:deactivate',
  'alert_rules:manage',
  'medications:read',
  'medications:create',
  'medications:update',
  'medications:deactivate',
  'reports:generate',
];

/** Heranca da Figura 28: admin = profissional + administrativas. */
const ADMIN = [
  ...PROFESSIONAL,
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
];

const MATRIX: Readonly<Record<string, readonly string[]>> = {
  admin: ADMIN,
  professional: PROFESSIONAL,
  caregiver: CAREGIVER,
  family: FAMILY,
};

/** Pares (perfil, permissao) da matriz, como duas colunas para `unnest`. */
const MATRIX_PROFILE_CODES = Object.entries(MATRIX).flatMap(
  ([profile, codes]) => codes.map(() => profile),
);
const MATRIX_PERMISSION_CODES = Object.values(MATRIX).flat();

/**
 * Alinha as organizacoes clientes que ja existem a matriz de perfis do BE-05
 * (RF005/RF016), com a mesma semantica de `provisionTenantProfiles`:
 *
 * - catalogo `permissions` recebe os 33 codigos de tenant; codigo existente tem
 *   o rotulo padronizado e `deleted_at` limpo;
 * - toda organizacao `kind = 'tenant'` (ativa ou inativa) tem os quatro perfis;
 *   perfil existente tem nome/descricao padronizados e `deleted_at` limpo;
 * - concessoes da matriz sao criadas ou reativadas; concessao viva dos quatro
 *   perfis fora da matriz recebe `deleted_at = now()`, sem ser apagada.
 *
 * Nao toca a organizacao de plataforma nem perfil de tenant com codigo fora dos
 * quatro. A matriz e a desta data, em SQL com dados literais.
 *
 * `down` de melhor esforco: o estado anterior variava entre ambientes (o seed
 * de desenvolvimento ja criava os quatro perfis), entao ele apaga apenas as
 * concessoes e os codigos de catalogo que nao existiam antes (os 30 novos). Nao
 * remove perfis nem restaura textos ou concessoes revogadas; as tres
 * permissoes antigas do `admin` continuam concedidas.
 */
export class SyncTenantAccessProfiles1790300000000 implements MigrationInterface {
  name = 'SyncTenantAccessProfiles1790300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `INSERT INTO ${table('permissions')} (code, name)
       SELECT catalog.code, catalog.name
         FROM unnest($1::text[], $2::text[]) AS catalog(code, name)
       ON CONFLICT (code) DO UPDATE
          SET name = EXCLUDED.name,
              deleted_at = NULL`,
      [
        TENANT_PERMISSIONS.map(([code]) => code),
        TENANT_PERMISSIONS.map(([, name]) => name),
      ],
    );

    await queryRunner.query(
      `INSERT INTO ${table('access_profiles')} (organization_id, code, name, description)
       SELECT organization.id, profile.code, profile.name, profile.description
         FROM ${table('organizations')} organization
        CROSS JOIN unnest($1::text[], $2::text[], $3::text[])
              AS profile(code, name, description)
        WHERE organization.kind = 'tenant'
       ON CONFLICT (organization_id, code) DO UPDATE
          SET name = EXCLUDED.name,
              description = EXCLUDED.description,
              deleted_at = NULL,
              updated_at = now()`,
      [
        TENANT_PROFILES.map(([code]) => code),
        TENANT_PROFILES.map(([, name]) => name),
        TENANT_PROFILES.map(([, , description]) => description),
      ],
    );

    await queryRunner.query(
      `INSERT INTO ${table('profile_permissions')} (organization_id, profile_id, permission_id)
       SELECT profile.organization_id, profile.id, permission.id
         FROM unnest($1::text[], $2::text[]) AS matrix(profile_code, permission_code)
         JOIN ${table('access_profiles')} profile
           ON profile.code = matrix.profile_code
         JOIN ${table('organizations')} organization
           ON organization.id = profile.organization_id
          AND organization.kind = 'tenant'
         JOIN ${table('permissions')} permission
           ON permission.code = matrix.permission_code
       ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`,
      [MATRIX_PROFILE_CODES, MATRIX_PERMISSION_CODES],
    );

    await queryRunner.query(
      `UPDATE ${table('profile_permissions')} grant_row
          SET deleted_at = now()
         FROM ${table('access_profiles')} profile,
              ${table('organizations')} organization,
              ${table('permissions')} permission
        WHERE profile.id = grant_row.profile_id
          AND organization.id = profile.organization_id
          AND organization.kind = 'tenant'
          AND permission.id = grant_row.permission_id
          AND grant_row.deleted_at IS NULL
          AND profile.code = ANY($3::text[])
          AND NOT EXISTS (
            SELECT 1
              FROM unnest($1::text[], $2::text[]) AS matrix(profile_code, permission_code)
             WHERE matrix.profile_code = profile.code
               AND matrix.permission_code = permission.code
          )`,
      [
        MATRIX_PROFILE_CODES,
        MATRIX_PERMISSION_CODES,
        TENANT_PROFILES.map(([code]) => code),
      ],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    const newCodes = TENANT_PERMISSIONS.map(([code]) => code).filter(
      (code) => !LEGACY_TENANT_CODES.includes(code),
    );

    await queryRunner.query(
      `DELETE FROM ${table('profile_permissions')} grant_row
        USING ${table('permissions')} permission
        WHERE permission.id = grant_row.permission_id
          AND permission.code = ANY($1::text[])`,
      [newCodes],
    );
    await queryRunner.query(
      `DELETE FROM ${table('permissions')} WHERE code = ANY($1::text[])`,
      [newCodes],
    );
  }
}
