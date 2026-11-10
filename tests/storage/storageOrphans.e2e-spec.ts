import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

import { findOrphanFiles, loadActiveStorageKeys } from '@/storage/orphanFiles';

import {
  TRUNCATE_AUTOMATION,
  testDataSource,
} from '../modules/Automation/automation.fixtures';

/**
 * Orfaos do volume contra o PostgreSQL **real**: so a linha ativa protege o
 * arquivo; a removida (deleted_at) deixa o arquivo orfao.
 */
const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('arquivos orfaos do volume (PostgreSQL real)', () => {
  let dataSource: DataSource;
  let root: string;

  beforeAll(async () => {
    dataSource = testDataSource(databaseUrl!);
    await dataSource.initialize();
    await dataSource.runMigrations();
    root = await mkdtemp(join(tmpdir(), 'vitacare-orphans-e2e-'));
  }, 60000);

  afterAll(async () => {
    await dataSource.query(TRUNCATE_AUTOMATION);
    for (const _ of await dataSource.query('SELECT 1 FROM migrations')) {
      await dataSource.undoLastMigration();
    }
    await dataSource.destroy();
    await rm(root, { recursive: true, force: true });
  }, 60000);

  it('so o arquivo de linha ativa deixa de ser orfao', async () => {
    const organizationId = randomUUID();
    const active = `attachments/${organizationId}/${randomUUID()}`;
    const removed = `attachments/${organizationId}/${randomUUID()}`;
    const runner = dataSource.createQueryRunner();

    // Sem a cadeia de FKs (registro, usuario): so a linha importa aqui.
    await runner.query("SET session_replication_role = 'replica'");
    for (const [key, deletedAt] of [
      [active, null],
      [removed, new Date()],
    ] as const) {
      await runner.query(
        `INSERT INTO follow_up_attachments
           (id, organization_id, record_id, uploaded_by_user_id, file_name,
            content_type, storage_key, size_bytes, deleted_at)
         VALUES ($1, $2, $3, $4, 'exame.png', 'image/png', $5, 1, $6)`,
        [
          randomUUID(),
          organizationId,
          randomUUID(),
          randomUUID(),
          key,
          deletedAt,
        ],
      );
    }
    await runner.query("SET session_replication_role = 'origin'");
    await runner.release();

    const old = new Date(Date.now() - 48 * 3_600_000);
    for (const key of [active, removed]) {
      await mkdir(dirname(join(root, key)), { recursive: true });
      await writeFile(join(root, key), 'x');
      await utimes(join(root, key), old, old);
    }

    const orphans = await findOrphanFiles({
      root,
      activeKeys: await loadActiveStorageKeys(dataSource),
      now: new Date(),
    });

    expect(orphans.map((orphan) => orphan.key)).toEqual([removed]);
  });
});
