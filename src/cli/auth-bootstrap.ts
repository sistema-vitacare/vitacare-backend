import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import databaseConfig from '@/config/database.config';
import { buildDataSourceOptions } from '@/database/typeorm.options';
import {
  BootstrapAuthCommand,
  parseBootstrapArguments,
} from '@/modules/Auth/BootstrapAuth/bootstrapAuth.command';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';

const USAGE = `Uso:
  npm run auth:bootstrap -- \\
    --organization-code clinica-exemplo \\
    --usage-plan-id <uuid do plano ja cadastrado> \\
    --trade-name "Clinica Exemplo" \\
    --admin-name "Nome do administrador" \\
    --admin-email admin@example.test \\
    --admin-cpf 00000000000

O comando nao aceita senha por argumento: a senha provisoria e sorteada e
mostrada uma unica vez ao final.`;

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }

  return value;
};

const buildDataSource = (): DataSource => {
  const settings = databaseConfig();

  return new DataSource(
    buildDataSourceOptions({
      ...settings,
      host: required('DB_HOST', settings.host),
      username: required('DB_USERNAME', settings.username),
      password: required('DB_PASSWORD', settings.password),
      database: required('DB_DATABASE', settings.database),
    }),
  );
};

/**
 * Cria a primeira organizacao e o seu administrador em um banco ja migrado.
 * Escreve no processo, nunca no logger da aplicacao: a senha provisoria nao
 * pode acabar em log estruturado nem em auditoria.
 */
const main = async (): Promise<void> => {
  loadEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });

  const input = parseBootstrapArguments(process.argv.slice(2));
  const dataSource = buildDataSource();

  await dataSource.initialize();

  try {
    const command = new BootstrapAuthCommand(dataSource, new PasswordHasher());
    const result = await command.execute(input);

    process.stdout.write(
      [
        'Organizacao e administrador criados.',
        `organizationId: ${result.organizationId}`,
        `profileId: ${result.profileId}`,
        `userId: ${result.userId}`,
        `senha provisoria (exibida uma unica vez): ${result.temporaryPassword}`,
        'O primeiro acesso exige a troca desta senha.',
        '',
      ].join('\n'),
    );
  } finally {
    await dataSource.destroy();
  }
};

main().catch((error: unknown) => {
  const message =
    error instanceof DomainException
      ? `${error.code}: ${error.detail ?? 'sem detalhe.'}`
      : 'Falha inesperada no bootstrap. Verifique conexao e migrations.';

  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
