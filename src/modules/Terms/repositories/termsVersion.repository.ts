import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { TermsVersionRow } from '../types/terms.types';

const COLUMNS = `id, version, title, content,
                 content_hash AS "contentHash", published_at AS "publishedAt"`;

/** Leitura das versoes publicadas; a escrita e so por migration (BE-32). */
@Injectable()
export class TermsVersionRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** A vigente e a de maior numero. */
  async findCurrent(): Promise<TermsVersionRow | null> {
    const [row] = await this.dataSource.query<TermsVersionRow[]>(
      `SELECT ${COLUMNS} FROM terms_versions ORDER BY version DESC LIMIT 1`,
    );

    return row ?? null;
  }

  async findByVersion(version: number): Promise<TermsVersionRow | null> {
    const [row] = await this.dataSource.query<TermsVersionRow[]>(
      `SELECT ${COLUMNS} FROM terms_versions WHERE version = $1`,
      [version],
    );

    return row ?? null;
  }
}
