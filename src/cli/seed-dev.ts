import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import databaseConfig from '@/config/database.config';
import {
  DEV_ORGANIZATIONS,
  DEV_PASSWORD,
  DEV_USERS,
  runDevSeed,
} from '@/database/seeds/devSeed';
import { buildDataSourceOptions } from '@/database/typeorm.options';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }

  return value;
};

/**
 * O seed grava senha conhecida e dados de pessoas reais do time. Fora de
 * desenvolvimento isso e incidente, nao conveniencia: o comando recusa
 * qualquer outro `NODE_ENV`.
 */
const assertDevelopment = (): void => {
  const environment = process.env.NODE_ENV ?? 'development';

  if (environment !== 'development' && environment !== 'test') {
    throw new Error(
      `Seed de desenvolvimento bloqueado em NODE_ENV=${environment}. ` +
        'Ele cria contas com senha conhecida e nao deve existir fora do ambiente local.',
    );
  }
};

const main = async (): Promise<void> => {
  loadEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });

  assertDevelopment();

  const settings = databaseConfig();

  const dataSource = new DataSource(
    buildDataSourceOptions({
      ...settings,
      host: required('DB_HOST', settings.host),
      username: required('DB_USERNAME', settings.username),
      password: required('DB_PASSWORD', settings.password),
      database: required('DB_DATABASE', settings.database),
    }),
  );

  await dataSource.initialize();

  try {
    const result = await runDevSeed(dataSource, new PasswordHasher());

    const lines = [
      'Seed de desenvolvimento aplicado.',
      `planos criados: ${result.plans}`,
      `organizacoes criadas: ${result.organizations}`,
      `perfis criados: ${result.profiles}`,
      `usuarios criados: ${result.users}`,
      '',
      'Contas disponiveis (todas com a mesma senha de desenvolvimento):',
      ...DEV_USERS.map(
        (user) =>
          `  ${user.organizationCode.padEnd(16)} ${user.profileCode.padEnd(13)} ${user.email}`,
      ),
      `  senha: ${DEV_PASSWORD}`,
      '',
      `organizacoes: ${DEV_ORGANIZATIONS.map((o) => o.code).join(', ')}`,
      'Zero criado em todas as linhas significa que o seed ja estava aplicado.',
      '',
    ];

    process.stdout.write(lines.join('\n'));
  } finally {
    await dataSource.destroy();
  }
};

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Falha inesperada no seed.';

  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
