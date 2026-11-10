import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { findOrphanFiles } from '@/storage/orphanFiles';

const NOW = new Date('2026-11-10T12:00:00Z');
const HOUR = 3_600_000;

describe('findOrphanFiles', () => {
  let root: string;

  const file = async (key: string, ageMs: number, content = 'x') => {
    const path = join(root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    const at = new Date(NOW.getTime() - ageMs);
    await utimes(path, at, at);
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vitacare-orphans-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lista anexo antigo sem linha ativa e temporario antigo', async () => {
    await file('attachments/org-a/sem-linha', 48 * HOUR, 'abc');
    await file('tmp/upload-abandonado', 30 * HOUR);

    const orphans = await findOrphanFiles({
      root,
      activeKeys: new Set(),
      now: NOW,
    });

    expect(orphans).toEqual([
      {
        key: 'attachments/org-a/sem-linha',
        size: 3,
        modifiedAt: new Date(NOW.getTime() - 48 * HOUR),
        kind: 'attachment',
      },
      {
        key: 'tmp/upload-abandonado',
        size: 1,
        modifiedAt: new Date(NOW.getTime() - 30 * HOUR),
        kind: 'temp',
      },
    ]);
  });

  it('nao lista anexo com linha ativa', async () => {
    await file('attachments/org-a/ativo', 48 * HOUR);

    await expect(
      findOrphanFiles({
        root,
        activeKeys: new Set(['attachments/org-a/ativo']),
        now: NOW,
      }),
    ).resolves.toEqual([]);
  });

  it('nunca lista arquivo com menos de 24 h (upload em andamento)', async () => {
    await file('attachments/org-a/recente', HOUR);
    await file('tmp/em-andamento', HOUR);

    await expect(
      findOrphanFiles({ root, activeKeys: new Set(), now: NOW }),
    ).resolves.toEqual([]);
  });

  it('raiz vazia ou inexistente nao tem orfaos', async () => {
    await expect(
      findOrphanFiles({ root, activeKeys: new Set(), now: NOW }),
    ).resolves.toEqual([]);
    await expect(
      findOrphanFiles({
        root: join(root, 'nao-existe'),
        activeKeys: new Set(),
        now: NOW,
      }),
    ).resolves.toEqual([]);
  });
});
