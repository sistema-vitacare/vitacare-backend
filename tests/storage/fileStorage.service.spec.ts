import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

import { FileStorageService } from '@/storage/fileStorage.service';

const readAll = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks);
};

describe('FileStorageService', () => {
  let root: string;
  let storage: FileStorageService;

  const serviceAt = (path: string) =>
    new FileStorageService({
      getOrThrow: (key: string) => {
        if (key !== 'storage.path') throw new Error(key);
        return path;
      },
    } as never);

  const tempFile = async (content: string) => {
    const path = join(storage.tempDir, `upload-${Math.random()}`);

    await writeFile(path, content);

    return path;
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vitacare-storage-'));
    storage = serviceAt(join(root, 'files'));
    await storage.onModuleInit();
  });

  afterEach(async () => {
    await chmod(root, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });

  it('cria a raiz e o diretorio de temporarios na inicializacao', async () => {
    expect((await stat(join(root, 'files'))).isDirectory()).toBe(true);
    expect(storage.tempDir).toBe(join(root, 'files', 'tmp'));
    expect((await stat(storage.tempDir)).isDirectory()).toBe(true);
  });

  it('promove o temporario para a chave final, so com leitura do dono e do grupo', async () => {
    const temp = await tempFile('conteudo');

    await storage.promote(temp, 'attachments/org/arquivo');

    const final = join(root, 'files', 'attachments', 'org', 'arquivo');

    await expect(readFile(final, 'utf8')).resolves.toBe('conteudo');
    expect((await stat(final)).mode & 0o777).toBe(0o640);
    await expect(stat(temp)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('abre a chave com o conteudo e o tamanho', async () => {
    await storage.promote(await tempFile('abc123'), 'attachments/org/a');

    const opened = await storage.open('attachments/org/a');

    expect(opened?.size).toBe(6);
    await expect(readAll(opened!.stream)).resolves.toEqual(
      Buffer.from('abc123'),
    );
  });

  it('devolve null ao abrir chave ausente', async () => {
    await expect(storage.open('attachments/org/nada')).resolves.toBeNull();
  });

  it('remove a chave e ignora remocao repetida', async () => {
    await storage.promote(await tempFile('x'), 'attachments/org/b');

    await storage.remove('attachments/org/b');
    await storage.remove('attachments/org/b');

    await expect(storage.open('attachments/org/b')).resolves.toBeNull();
  });

  it('descarta temporario e ignora temporario ja movido', async () => {
    const temp = await tempFile('x');

    await storage.discard(temp);
    await storage.discard(temp);

    await expect(stat(temp)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recusa chave que sai da raiz', async () => {
    const temp = await tempFile('x');

    await expect(storage.promote(temp, '../fora')).rejects.toThrow();
    await expect(storage.open('../../etc/passwd')).rejects.toThrow();
    await expect(storage.remove('a/../../fora')).rejects.toThrow();
  });

  it('recusa descartar caminho fora dos temporarios', async () => {
    await expect(storage.discard(join(root, 'files', 'x'))).rejects.toThrow();
  });

  it('nao inicializa sem permissao de escrita na raiz', async () => {
    if (process.getuid?.() === 0) return;

    const blocked = serviceAt(join(root, 'locked', 'files'));

    await chmod(root, 0o500);

    await expect(blocked.onModuleInit()).rejects.toThrow();
  });
});
