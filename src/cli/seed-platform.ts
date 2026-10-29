import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

import { DomainException } from '@/common/errors/domain.exception';
import databaseConfig from '@/config/database.config';
import {
  parsePlatformSeedArguments,
  runPlatformSeed,
} from '@/database/seeds/platformSeed';
import { buildDataSourceOptions } from '@/database/typeorm.options';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';

const USAGE = `Uso:
  npm run seed:platform -- \\
    --organization-code vitacare \\
    --trade-name "VitaCare" \\
    --admin-name "Nome do administrador master" \\
    --admin-email master@example.test \\
    --admin-cpf 00000000000

Cria a organizacao de plataforma e o primeiro administrador master. As demais
organizacoes sao cadastradas por ele em POST /api/v1/organizations. O comando
nao aceita senha: a provisoria e sorteada e mostrada uma unica vez.`;

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }

  return value;
};

/** Escreve no processo, nunca no logger: a senha provisoria nao vai para log. */
const main = async (): Promise<void> => {
  loadEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });

  const input = parsePlatformSeedArguments(process.argv.slice(2));
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
    const result = await runPlatformSeed(
      dataSource,
      new PasswordHasher(),
      input,
    );

    process.stdout.write(
      [
        'Organizacao de plataforma e administrador master criados.',
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
      : 'Falha inesperada no seed da plataforma. Verifique conexao e migrations.';

  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
