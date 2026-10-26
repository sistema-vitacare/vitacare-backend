import { DataSource, EntityManager } from 'typeorm';

import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';

/**
 * Base minima de desenvolvimento: dois planos, duas organizacoes, perfis e
 * usuarios com senha conhecida. Serve para exercitar a API e, principalmente,
 * para testar **isolamento entre organizacoes** — por isso duas, e nao uma.
 *
 * Nada aqui e catalogo comercial nem matriz de permissao aprovada: planos
 * (P05/P06) e permissoes por perfil (RF005/RF016) continuam pendentes de
 * decisao de produto. O seed e **idempotente**: rodar de novo nao duplica.
 */

/** Senha unica dos usuarios de desenvolvimento. Nunca usar fora daqui. */
export const DEV_PASSWORD = '12345678';

export interface DevPlan {
  name: string;
  description: string;
  userLimit: number;
  patientLimit: number;
  monthlyPrice: string;
}

export interface DevOrganization {
  code: string;
  tradeName: string;
  legalName: string;
  document: string;
  phone: string;
  email: string;
  plan: string;
}

export interface DevUser {
  email: string;
  name: string;
  cpf: string;
  phone: string;
  organizationCode: string;
  profileCode: string;
}

export const DEV_PLANS: DevPlan[] = [
  {
    name: 'Basic',
    description: 'Plano de desenvolvimento; catalogo comercial pendente (P05).',
    userLimit: 10,
    patientLimit: 100,
    monthlyPrice: '199.90',
  },
  {
    name: 'Enterprise',
    description: 'Plano de desenvolvimento; catalogo comercial pendente (P05).',
    userLimit: 100,
    patientLimit: 2000,
    monthlyPrice: '1499.90',
  },
];

export const DEV_ORGANIZATIONS: DevOrganization[] = [
  {
    code: 'clinica-vida',
    tradeName: 'Clinica Vida',
    legalName: 'Clinica Vida Assistencia Domiciliar LTDA',
    document: '11222333000181',
    phone: '1130001000',
    email: 'contato@clinicavida.test',
    plan: 'Enterprise',
  },
  {
    code: 'casa-bem-estar',
    tradeName: 'Casa Bem-Estar',
    legalName: 'Casa Bem-Estar Cuidados Continuados LTDA',
    document: '44555666000172',
    phone: '1130002000',
    email: 'contato@casabemestar.test',
    plan: 'Basic',
  },
];

/**
 * Perfis por organizacao. Os quatro codigos vem de `ProfileCode`; a matriz de
 * acao, campo e vinculo de cada um ainda nao foi decidida.
 */
export const DEV_PROFILES = [
  { code: 'admin', name: 'Administrador' },
  { code: 'professional', name: 'Profissional de saude' },
  { code: 'caregiver', name: 'Cuidador' },
  { code: 'family', name: 'Familiar' },
];

/**
 * Unica permissao do catalogo hoje. Concedida so ao perfil `admin`: inventar o
 * resto da matriz aqui criaria regra de acesso sem decisao de produto.
 */
const ADMIN_PERMISSIONS = [
  { code: 'users:reset_password', name: 'Redefinir senha de usuario' },
];

export const DEV_USERS: DevUser[] = [
  {
    email: 'mateusmenavila@gmail.com',
    name: 'Mateus Avila',
    cpf: '11144477735',
    phone: '11990000001',
    organizationCode: 'clinica-vida',
    profileCode: 'admin',
  },
  {
    email: 'enzodaun@gmail.com',
    name: 'Enzo Daun',
    cpf: '22255588846',
    phone: '11990000002',
    organizationCode: 'clinica-vida',
    profileCode: 'professional',
  },
  {
    email: 'miguelribas@gmail.com',
    name: 'Miguel Ribas',
    cpf: '33366699957',
    phone: '11990000003',
    organizationCode: 'casa-bem-estar',
    profileCode: 'admin',
  },
];

export interface DevSeedResult {
  plans: number;
  organizations: number;
  profiles: number;
  users: number;
}

interface IdRow {
  id: string;
}

/**
 * Insere ou reaproveita a linha, sempre pela chave natural. A consulta vem
 * **antes** do insert porque nem toda tabela tem restricao de unicidade que
 * sirva de chave natural: `usage_plans` nao tem, e um `ON CONFLICT` la nunca
 * conflitaria — o seed duplicaria os planos a cada execucao. O `ON CONFLICT DO
 * NOTHING` do insert cobre apenas a corrida entre duas execucoes simultaneas.
 */
const upsertId = async (
  manager: EntityManager,
  insert: { sql: string; parameters: unknown[] },
  select: { sql: string; parameters: unknown[] },
): Promise<{ id: string; created: boolean }> => {
  const existing = await manager.query<IdRow[]>(select.sql, select.parameters);

  if (existing[0]) {
    return { id: existing[0].id, created: false };
  }

  const inserted = await manager.query<IdRow[]>(insert.sql, insert.parameters);

  if (inserted[0]) {
    return { id: inserted[0].id, created: true };
  }

  const concurrent = await manager.query<IdRow[]>(
    select.sql,
    select.parameters,
  );

  return { id: concurrent[0].id, created: false };
};

export const runDevSeed = async (
  dataSource: DataSource,
  passwords: PasswordHasher,
): Promise<DevSeedResult> => {
  const passwordHash = await passwords.hash(DEV_PASSWORD);

  return dataSource.transaction(async (manager) => {
    const result: DevSeedResult = {
      plans: 0,
      organizations: 0,
      profiles: 0,
      users: 0,
    };

    const planIds = new Map<string, string>();

    for (const plan of DEV_PLANS) {
      const { id, created } = await upsertId(
        manager,
        {
          sql: `INSERT INTO usage_plans (name, description, user_limit, patient_limit, monthly_price)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT DO NOTHING
                RETURNING id`,
          parameters: [
            plan.name,
            plan.description,
            plan.userLimit,
            plan.patientLimit,
            plan.monthlyPrice,
          ],
        },
        {
          sql: `SELECT id FROM usage_plans WHERE name = $1 ORDER BY created_at LIMIT 1`,
          parameters: [plan.name],
        },
      );

      planIds.set(plan.name, id);
      result.plans += created ? 1 : 0;
    }

    const organizationIds = new Map<string, string>();

    for (const organization of DEV_ORGANIZATIONS) {
      const { id, created } = await upsertId(
        manager,
        {
          sql: `INSERT INTO organizations
                  (usage_plan_id, trade_name, legal_name, document, phone, email, code)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT DO NOTHING
                RETURNING id`,
          parameters: [
            planIds.get(organization.plan),
            organization.tradeName,
            organization.legalName,
            organization.document,
            organization.phone,
            organization.email,
            organization.code,
          ],
        },
        {
          sql: `SELECT id FROM organizations WHERE code = $1`,
          parameters: [organization.code],
        },
      );

      organizationIds.set(organization.code, id);
      result.organizations += created ? 1 : 0;
    }

    const permissionIds = new Map<string, string>();

    for (const permission of ADMIN_PERMISSIONS) {
      const rows = await manager.query<IdRow[]>(
        `INSERT INTO permissions (code, name)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = permissions.name
         RETURNING id`,
        [permission.code, permission.name],
      );

      permissionIds.set(permission.code, rows[0].id);
    }

    const profileIds = new Map<string, string>();

    for (const [code, organizationId] of organizationIds) {
      for (const profile of DEV_PROFILES) {
        const { id, created } = await upsertId(
          manager,
          {
            sql: `INSERT INTO access_profiles (organization_id, code, name, description)
                  VALUES ($1, $2, $3, 'Perfil criado pelo seed de desenvolvimento')
                  ON CONFLICT DO NOTHING
                  RETURNING id`,
            parameters: [organizationId, profile.code, profile.name],
          },
          {
            sql: `SELECT id FROM access_profiles WHERE organization_id = $1 AND code = $2`,
            parameters: [organizationId, profile.code],
          },
        );

        profileIds.set(`${code}:${profile.code}`, id);
        result.profiles += created ? 1 : 0;

        if (profile.code !== 'admin') {
          continue;
        }

        for (const permissionId of permissionIds.values()) {
          await manager.query(
            `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [organizationId, id, permissionId],
          );
        }
      }
    }

    for (const user of DEV_USERS) {
      const organizationId = organizationIds.get(user.organizationCode)!;
      const profileId = profileIds.get(
        `${user.organizationCode}:${user.profileCode}`,
      )!;

      const { created } = await upsertId(
        manager,
        {
          sql: `INSERT INTO users
                  (organization_id, profile_id, name, email, cpf, phone, password_hash,
                   status, must_change_password)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', false)
                ON CONFLICT DO NOTHING
                RETURNING id`,
          parameters: [
            organizationId,
            profileId,
            user.name,
            user.email,
            user.cpf,
            user.phone,
            passwordHash,
          ],
        },
        {
          sql: `SELECT id FROM users WHERE organization_id = $1 AND email = $2`,
          parameters: [organizationId, user.email],
        },
      );

      result.users += created ? 1 : 0;
    }

    return result;
  });
};
