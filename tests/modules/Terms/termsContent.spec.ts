import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  TERMS_V1_CONTENT,
  TERMS_V1_HASH,
  TERMS_V1_TITLE,
} from '@/database/migrations/1792200000001-PublishTermsOfUseV1';

/**
 * O texto publicado pela migration e o arquivo versionado em `docs/termos/`
 * sao o mesmo termo, byte a byte: o hash e a identidade da versao aceita.
 */
const TERMS_FILE = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'termos',
  'termo-de-uso-v1.md',
);

describe('termo de uso v1 (BE-32)', () => {
  const file = readFileSync(TERMS_FILE, 'utf8');

  it('a migration publica exatamente o arquivo do repositorio', () => {
    expect(TERMS_V1_CONTENT).toBe(file);
  });

  it('o hash da migration e o SHA-256 do arquivo', () => {
    expect(TERMS_V1_HASH).toBe(
      createHash('sha256').update(file, 'utf8').digest('hex'),
    );
  });

  it('o titulo e o primeiro cabecalho do arquivo', () => {
    expect(TERMS_V1_TITLE).toBe('Termo de Uso e Privacidade do VitaCare');
    expect(file.startsWith(`# ${TERMS_V1_TITLE}\n`)).toBe(true);
  });

  it('nao tem CR, contato a preencher nem promessa sobre HTTPS', () => {
    expect(file).not.toContain('\r');
    expect(file).not.toContain('[a preencher]');
    expect(file).not.toMatch(/https/i);
  });
});
