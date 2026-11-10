import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { DataSource } from 'typeorm';

export interface OrphanFile {
  key: string;
  size: number;
  modifiedAt: Date;
  kind: 'attachment' | 'temp';
}

/** Um upload grava o arquivo antes do commit: nada recente e orfao. */
const DEFAULT_MIN_AGE_MS = 86_400_000;

const listFiles = async (dir: string): Promise<string[]> => {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
};

/**
 * Arquivos do volume sem linha ativa em `follow_up_attachments` (compensacao
 * que falhou, remocao que nao apagou, restauracao de banco mais antigo) e
 * temporarios abandonados. Ferramenta do operador: so lista, quem apaga e o CLI.
 */
export const findOrphanFiles = async (input: {
  root: string;
  activeKeys: ReadonlySet<string>;
  now: Date;
  minAgeMs?: number;
}): Promise<OrphanFile[]> => {
  const cutoff = input.now.getTime() - (input.minAgeMs ?? DEFAULT_MIN_AGE_MS);
  const orphans: OrphanFile[] = [];

  for (const [folder, kind] of [
    ['attachments', 'attachment'],
    ['tmp', 'temp'],
  ] as const) {
    for (const path of (await listFiles(join(input.root, folder))).sort()) {
      const key = relative(input.root, path).split(sep).join('/');
      const info = await stat(path);

      if (info.mtime.getTime() > cutoff) continue;
      if (kind === 'attachment' && input.activeKeys.has(key)) continue;

      orphans.push({ key, size: info.size, modifiedAt: info.mtime, kind });
    }
  }

  return orphans;
};

/** Todas as organizacoes de proposito: o volume e um so. */
export const loadActiveStorageKeys = async (
  dataSource: DataSource,
): Promise<Set<string>> => {
  const rows = await dataSource.query<Array<{ storage_key: string }>>(
    'SELECT storage_key FROM follow_up_attachments WHERE deleted_at IS NULL',
  );

  return new Set(rows.map((row) => row.storage_key));
};
