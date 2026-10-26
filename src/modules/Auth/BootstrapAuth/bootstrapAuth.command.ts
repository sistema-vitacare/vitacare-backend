import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import { isValidCpf, onlyDigits } from '@/common/validation/cpf';

import { AuthErrors } from '../auth.errors';
import { ORGANIZATION_CODE_PATTERN } from '../Login/login.dto';
import { generateTemporaryPassword } from '../ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';
import { PasswordHasher } from '../security/passwordHasher';

/** Permissao minima que o primeiro administrador precisa ter. */
const ADMIN_PERMISSION = {
  code: 'users:reset_password',
  name: 'Redefinir senha de usuario',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BootstrapAuthInput {
  organizationCode: string;
  usagePlanId: string;
  tradeName: string;
  adminName: string;
  adminEmail: string;
  adminCpf: string;
}

export interface BootstrapAuthResult {
  organizationId: string;
  profileId: string;
  userId: string;
  temporaryPassword: string;
}

interface IdRow {
  id: string;
}

interface PostgresError {
  code: string;
  constraint?: string;
}

const invalidInput = (detail: string): DomainException =>
  new DomainException({ ...AuthErrors.BOOTSTRAP_INVALID_INPUT, detail });

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

const OPTIONS = [
  '--organization-code',
  '--usage-plan-id',
  '--trade-name',
  '--admin-name',
  '--admin-email',
  '--admin-cpf',
] as const;

type Option = (typeof OPTIONS)[number];

/**
 * Le os argumentos nomeados do comando. Nao existe opcao de senha: a senha
 * provisoria e sorteada aqui e mostrada uma unica vez, para nao ficar no
 * historico do shell.
 */
export const parseBootstrapArguments = (argv: string[]): BootstrapAuthInput => {
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
  const usagePlanId = required('--usage-plan-id');
  const adminEmail = required('--admin-email').toLowerCase();
  const adminCpf = onlyDigits(required('--admin-cpf'));

  if (!ORGANIZATION_CODE_PATTERN.test(organizationCode)) {
    throw invalidInput(
      'Codigo da organizacao aceita apenas minusculas, digitos e hifens simples.',
    );
  }

  if (!UUID_PATTERN.test(usagePlanId)) {
    throw invalidInput('Identificador do plano precisa ser um UUID.');
  }

  if (!EMAIL_PATTERN.test(adminEmail)) {
    throw invalidInput('E-mail do administrador e invalido.');
  }

  if (!isValidCpf(adminCpf)) {
    throw invalidInput('CPF do administrador e invalido.');
  }

  return {
    organizationCode,
    usagePlanId,
    tradeName: required('--trade-name'),
    adminName: required('--admin-name'),
    adminEmail,
    adminCpf,
  };
};

/**
 * Cria a primeira organizacao e o seu administrador. Tudo em uma transacao:
 * uma falha no meio nao deixa organizacao sem administrador nem perfil sem
 * permissao. Reexecutar com identificadores ja usados falha em conflito, sem
 * criacao parcial.
 */
@Injectable()
export class BootstrapAuthCommand {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordHasher,
  ) {}

  async execute(input: BootstrapAuthInput): Promise<BootstrapAuthResult> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    try {
      const ids = await this.dataSource.transaction(async (manager) =>
        this.createTenant(manager, input, passwordHash),
      );

      return { ...ids, temporaryPassword };
    } catch (error) {
      throw this.translate(error);
    }
  }

  private async createTenant(
    manager: EntityManager,
    input: BootstrapAuthInput,
    passwordHash: string,
  ): Promise<Omit<BootstrapAuthResult, 'temporaryPassword'>> {
    const plans = await manager.query<IdRow[]>(
      `SELECT id
         FROM usage_plans
        WHERE id = $1
          AND status = true
          AND deleted_at IS NULL`,
      [input.usagePlanId],
    );

    if (!plans[0]) {
      throw new DomainException({
        ...AuthErrors.BOOTSTRAP_PLAN_NOT_FOUND,
        detail: 'Plano inexistente, inativo ou excluido.',
      });
    }

    const organizations = await manager.query<IdRow[]>(
      `INSERT INTO organizations (usage_plan_id, trade_name, code)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.usagePlanId, input.tradeName, input.organizationCode],
    );

    const organizationId = organizations[0].id;

    const profiles = await manager.query<IdRow[]>(
      `INSERT INTO access_profiles (organization_id, code, name, description)
       VALUES ($1, 'admin', 'Administrador', 'Perfil inicial criado pelo bootstrap')
       RETURNING id`,
      [organizationId],
    );

    const profileId = profiles[0].id;

    const permissions = await manager.query<IdRow[]>(
      `INSERT INTO permissions (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = permissions.name
       RETURNING id`,
      [ADMIN_PERMISSION.code, ADMIN_PERMISSION.name],
    );

    await manager.query(
      `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
       VALUES ($1, $2, $3)`,
      [organizationId, profileId, permissions[0].id],
    );

    const users = await manager.query<IdRow[]>(
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

    const userId = users[0].id;

    await manager.query(
      `INSERT INTO audit_events
         (organization_id, actor_type, action, entity_type, entity_id)
       VALUES ($1, 'system', 'auth.bootstrap_completed', 'organization', $1)`,
      [organizationId],
    );

    return { organizationId, profileId, userId };
  }

  /** O `detail` do driver carrega o valor duplicado, entao so a constraint sai. */
  private translate(error: unknown): unknown {
    if (error instanceof DomainException) {
      return error;
    }

    if (isPostgresError(error) && error.code === '23505') {
      return new DomainException({
        ...AuthErrors.BOOTSTRAP_CONFLICT,
        detail: `Violacao de unicidade na constraint ${error.constraint ?? 'sem constraint identificada'}.`,
        cause: error,
      });
    }

    return error;
  }
}
