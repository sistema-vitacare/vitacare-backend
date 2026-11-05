import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  access,
  chmod,
  constants,
  mkdir,
  open,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

/**
 * Arquivos privados num diretorio local, que em producao e o volume Docker
 * `vitacare-storage` (decisao de Mateus, 2026-11-05, no lugar do S3). Nada
 * daqui e servido direto: o acesso passa sempre por uma rota que autoriza a
 * partir do banco. As chaves sao geradas no servidor; mesmo assim, toda chave
 * que resolva para fora da raiz e recusada.
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('storage.path'));
  }

  /** Uploads em andamento; no mesmo volume, para a promocao ser um rename. */
  get tempDir(): string {
    return join(this.root, 'tmp');
  }

  /** Sem escrita na raiz a API nao sobe: o erro aparece no deploy. */
  async onModuleInit(): Promise<void> {
    await mkdir(this.tempDir, { recursive: true });
    await access(this.root, constants.W_OK);
    await access(this.tempDir, constants.W_OK);
  }

  async promote(tempPath: string, key: string): Promise<void> {
    const target = this.resolveKey(key);

    await mkdir(dirname(target), { recursive: true });
    await rename(this.resolveTemp(tempPath), target);
    await chmod(target, 0o640);
  }

  async open(key: string): Promise<{ stream: Readable; size: number } | null> {
    try {
      const handle = await open(this.resolveKey(key), 'r');
      const { size } = await handle.stat();

      return { stream: handle.createReadStream(), size };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await this.unlink(this.resolveKey(key));
  }

  async discard(tempPath: string): Promise<void> {
    await this.unlink(this.resolveTemp(tempPath));
  }

  private async unlink(path: string): Promise<void> {
    try {
      await rm(path);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  private resolveKey(key: string): string {
    return this.inside(this.root, resolve(this.root, key));
  }

  private resolveTemp(path: string): string {
    return this.inside(this.tempDir, resolve(path));
  }

  private inside(base: string, path: string): string {
    if (!path.startsWith(base + sep)) {
      throw new Error('Caminho de arquivo fora da raiz de armazenamento.');
    }

    return path;
  }
}
