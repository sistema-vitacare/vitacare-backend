import { config as loadEnv } from 'dotenv';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DataSource } from 'typeorm';

import databaseConfig from '@/config/database.config';
import storageConfig from '@/config/storage.config';
import { buildDataSourceOptions } from '@/database/typeorm.options';
import { findOrphanFiles, loadActiveStorageKeys } from '@/storage/orphanFiles';

const USAGE = `Uso (no container: docker exec app-vitacare node dist/cli/storage-orphans.js):
  node dist/cli/storage-orphans.js            lista os orfaos
  node dist/cli/storage-orphans.js --delete   apaga os listados

Orfao = arquivo em attachments/ sem linha ativa em follow_up_attachments, ou
temporario em tmp/, com mais de 24 h. Depois de uma restauracao, revise a
lista antes de apagar.`;

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }

  return value;
};

/** Imprime so chave e tamanho: o nome original do anexo nunca sai daqui. */
const main = async (): Promise<void> => {
  loadEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });

  const args = process.argv.slice(2);
  const remove = args.includes('--delete');

  if (args.some((arg) => arg !== '--delete')) {
    throw new Error('Argumento desconhecido.');
  }

  const settings = databaseConfig();
  const root = resolve(storageConfig().path);
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
    const orphans = await findOrphanFiles({
      root,
      activeKeys: await loadActiveStorageKeys(dataSource),
      now: new Date(),
    });
    const bytes = orphans.reduce((total, orphan) => total + orphan.size, 0);

    for (const orphan of orphans) {
      process.stdout.write(`${orphan.kind}\t${orphan.key}\t${orphan.size}\n`);
    }
    process.stdout.write(`${orphans.length} orfaos, ${bytes} bytes.\n`);

    if (remove) {
      for (const orphan of orphans) await rm(join(root, orphan.key));
      process.stdout.write(`${orphans.length} arquivos apagados.\n`);
    }
  } finally {
    await dataSource.destroy();
  }
};

main().catch((error: unknown) => {
  const message =
    error instanceof Error && /^(Argumento|Variavel)/.test(error.message)
      ? error.message
      : 'Falha ao procurar orfaos. Verifique conexao, migrations e STORAGE_PATH.';

  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
