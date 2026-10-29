import { DataSource } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { isValidCpf, onlyDigits } from '@/common/validation/cpf';
import { PLATFORM_ADMIN_PERMISSIONS } from '@/modules/Access/access.permissions';
import { grantPermissions } from '@/modules/Access/repositories/permissionGrant.repository';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';
import { ORGANIZATION_CODE_PATTERN } from '@/modules/Auth/Login/login.dto';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { generateTemporaryPassword } from '@/modules/Auth/security/temporaryPassword';
import { OrganizationErrors } from '@/modules/Organization/organization.errors';

export interface PlatformSeedInput {
  organizationCode: string;
  tradeName: string;
  adminName: string;
  adminEmail: string;
  adminCpf: string;
}

export interface PlatformSeedResult {
  organizationId: string;
  profileId: string;
  userId: string;
  temporaryPassword: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OPTIONS = [
  '--organization-code',
  '--trade-name',
  '--admin-name',
  '--admin-email',
  '--admin-cpf',
] as const;

type Option = (typeof OPTIONS)[number];

const invalidInput = (detail: string): DomainException =>
  new DomainException({ ...OrganizationErrors.SEED_INVALID_INPUT, detail });

/** Nao existe opcao de senha: a provisoria e sorteada e sai uma unica vez. */
export const parsePlatformSeedArguments = (
  argv: string[],
): PlatformSeedInput => {
  const values = new Map<Option, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];

    if (!OPTIONS.includes(option as Option)) {
      throw invalidInput(`Argumento nao reconhecido: ${String(option)}.`);
    }

    if (value === undefined || value.startsWith('--')) {
      throw invalidInput(`Argumento ${option} exige um valor.`);
    }

    values.set(option as Option, value);
  }

  const required = (option: Option): string => {
    const value = values.get(option)?.trim();

    if (!value) {
      throw invalidInput(`Argumento obrigatorio ausente: ${option}.`);
    }

    return value;
  };

  const organizationCode = required('--organization-code').toLowerCase();
  const adminEmail = required('--admin-email').toLowerCase();
  const adminCpf = onlyDigits(required('--admin-cpf'));

  if (!ORGANIZATION_CODE_PATTERN.test(organizationCode)) {
    throw invalidInput(
      'Codigo da organizacao aceita apenas minusculas, digitos e hifens simples.',
    );
  }

  if (!EMAIL_PATTERN.test(adminEmail)) {
    throw invalidInput('E-mail do administrador e invalido.');
  }

  if (!isValidCpf(adminCpf)) {
    throw invalidInput('CPF do administrador e invalido.');
  }

  return {
    organizationCode,
    tradeName: required('--trade-name'),
    adminName: required('--admin-name'),
    adminEmail,
    adminCpf,
  };
};

interface PostgresError {
  code: string;
  constraint?: string;
}

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

/**
 * Cria a organizacao de plataforma e o primeiro administrador master. Roda uma
 * vez por banco: a segunda execucao falha sem tocar em nada, em vez de emitir
 * outra senha para uma conta que ja existe.
 */
export const runPlatformSeed = async (
  dataSource: DataSource,
  passwords: PasswordHasher,
  input: PlatformSeedInput,
): Promise<PlatformSeedResult> => {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await passwords.hash(temporaryPassword);

  try {
    const ids = await dataSource.transaction(async (manager) => {
      const existing = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM organizations WHERE kind = 'platform'`,
      );

      if (existing[0]) {
        throw new DomainException({
          ...OrganizationErrors.PLATFORM_ALREADY_EXISTS,
          detail: 'Ja existe organizacao de plataforma neste banco.',
        });
      }

      const [{ id: organizationId }] = await manager.query<
        Array<{ id: string }>
      >(
        `INSERT INTO organizations (kind, code, trade_name)
         VALUES ('platform', $1, $2)
         RETURNING id`,
        [input.organizationCode, input.tradeName],
      );

      const [{ id: profileId }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO access_profiles (organization_id, code, name, description)
         VALUES ($1, 'platform_admin', 'Administrador master', 'Administracao da plataforma VitaCare')
         RETURNING id`,
        [organizationId],
      );

      await grantPermissions(
        manager,
        organizationId,
        profileId,
        PLATFORM_ADMIN_PERMISSIONS,
      );

      const [{ id: userId }] = await manager.query<Array<{ id: string }>>(
        `INSERT INTO users
           (organization_id, profile_id, name, email, cpf, password_hash, status, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', true)
         RETURNING id`,
        [
          organizationId,
          profileId,
          input.adminName,
          input.adminEmail,
          input.adminCpf,
          passwordHash,
        ],
      );

      await insertAuditEvent(manager, {
        organizationId,
        actorUserId: null,
        action: 'organization.platform_seeded',
        entityType: 'organization',
        entityId: organizationId,
        requestId: null,
      });

      return { organizationId, profileId, userId };
    });

    return { ...ids, temporaryPassword };
  } catch (error) {
    if (
      isPostgresError(error) &&
      error.code === '23505' &&
      error.constraint === 'organizations_code_unique'
    ) {
      throw new DomainException({
        ...OrganizationErrors.CODE_TAKEN,
        detail: 'Codigo ja usado por outra organizacao.',
        cause: error,
      });
    }

    throw error;
  }
};
