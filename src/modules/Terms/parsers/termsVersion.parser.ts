import type { TermsVersionDto } from '../dtos/termsVersion.dto';
import { termsPagePath, type TermsVersionRow } from '../types/terms.types';

export const toTermsVersionResponse = (
  row: TermsVersionRow,
): TermsVersionDto => ({
  version: row.version,
  title: row.title,
  content: row.content,
  contentHash: row.contentHash,
  publishedAt: row.publishedAt.toISOString(),
  pageUrl: termsPagePath(row.version),
});
