import { DataSource, EntityManager } from 'typeorm';

import { PLATFORM_ADMIN_PERMISSIONS } from '@/modules/Access/access.permissions';
import { grantPermissions } from '@/modules/Access/repositories/permissionGrant.repository';
import { provisionTenantProfiles } from '@/modules/Access/repositories/tenantProfileProvisioning.repository';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';

/**
 * Base minima de desenvolvimento: dois planos, a organizacao de plataforma com
 * um administrador master, duas organizacoes clientes, perfis e usuarios com
 * senha conhecida. Serve para exercitar a API e, principalmente,
 * para testar **isolamento entre organizacoes** — por isso duas, e nao uma.
 *
 * Os planos nao sao catalogo comercial: P05/P06 continuam pendentes de
 * decisao de produto. Os quatro perfis de cada organizacao cliente seguem a
 * matriz decidida em 2026-10-29 (BE-05, RF005/RF016), aplicada por
 * `provisionTenantProfiles`, como no cadastro de organizacao. O seed e
 * **idempotente**: rodar de novo nao duplica.
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

export const DEV_PLATFORM = {
  code: 'vitacare',
  tradeName: 'VitaCare Plataforma',
};

export const DEV_USERS: DevUser[] = [
  {
    email: 'master@vitacare.test',
    name: 'Administrador Master',
    cpf: '44477700083',
    phone: '11990000000',
    organizationCode: 'vitacare',
    profileCode: 'platform_admin',
  },
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

    const platform = await upsertId(
      manager,
      {
        sql: `INSERT INTO organizations (kind, trade_name, code)
              VALUES ('platform', $1, $2)
              ON CONFLICT DO NOTHING
              RETURNING id`,
        parameters: [DEV_PLATFORM.tradeName, DEV_PLATFORM.code],
      },
      {
        sql: `SELECT id FROM organizations WHERE kind = 'platform'`,
        parameters: [],
      },
    );

    organizationIds.set(DEV_PLATFORM.code, platform.id);
    result.organizations += platform.created ? 1 : 0;

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

    const profileIds = new Map<string, string>();

    const platformProfile = await upsertId(
      manager,
      {
        sql: `INSERT INTO access_profiles (organization_id, code, name, description)
              VALUES ($1, 'platform_admin', 'Administrador master', 'Perfil criado pelo seed de desenvolvimento')
              ON CONFLICT DO NOTHING
              RETURNING id`,
        parameters: [platform.id],
      },
      {
        sql: `SELECT id FROM access_profiles WHERE organization_id = $1 AND code = 'platform_admin'`,
        parameters: [platform.id],
      },
    );

    profileIds.set(`${DEV_PLATFORM.code}:platform_admin`, platformProfile.id);
    result.profiles += platformProfile.created ? 1 : 0;

    await grantPermissions(
      manager,
      platform.id,
      platformProfile.id,
      PLATFORM_ADMIN_PERMISSIONS,
    );

    const profileCountOf = async (organizationId: string): Promise<number> => {
      const rows = await manager.query<Array<{ total: string }>>(
        `SELECT count(*)::text AS total FROM access_profiles WHERE organization_id = $1`,
        [organizationId],
      );

      return Number(rows[0].total);
    };

    for (const organization of DEV_ORGANIZATIONS) {
      const organizationId = organizationIds.get(organization.code)!;
      const before = await profileCountOf(organizationId);
      const profiles = await provisionTenantProfiles(manager, organizationId);

      result.profiles += (await profileCountOf(organizationId)) - before;

      for (const [profileCode, id] of Object.entries(profiles)) {
        profileIds.set(`${organization.code}:${profileCode}`, id);
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
