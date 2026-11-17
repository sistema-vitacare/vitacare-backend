import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  TERMS_V1_CONTENT,
  TERMS_V1_HASH,
  TERMS_V1_TITLE,
} from '@/database/migrations/1792200000001-PublishTermsOfUseV1';
import {
  TERMS_V2_CONTENT,
  TERMS_V2_HASH,
  TERMS_V2_TITLE,
} from '@/database/migrations/1792300000000-PublishTermsOfUseV2';

/**
 * O texto publicado por cada migration e o arquivo versionado em
 * `docs/termos/` sao o mesmo termo, byte a byte: o hash e a identidade da
 * versao aceita.
 */
const termsFile = (version: number) =>
  readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      'docs',
      'termos',
      `termo-de-uso-v${version}.md`,
    ),
    'utf8',
  );

describe.each([
  {
    version: 1,
    content: TERMS_V1_CONTENT,
    hash: TERMS_V1_HASH,
    title: TERMS_V1_TITLE,
  },
  {
    version: 2,
    content: TERMS_V2_CONTENT,
    hash: TERMS_V2_HASH,
    title: TERMS_V2_TITLE,
  },
])('termo de uso v$version', ({ version, content, hash, title }) => {
  const file = termsFile(version);

  it('a migration publica exatamente o arquivo do repositorio', () => {
    expect(content).toBe(file);
  });

  it('o hash da migration e o SHA-256 do arquivo', () => {
    expect(hash).toBe(createHash('sha256').update(file, 'utf8').digest('hex'));
  });

  it('o titulo e o primeiro cabecalho e a versao vem logo abaixo', () => {
    expect(title).toBe('Termo de Uso e Privacidade do VitaCare');
    expect(file.startsWith(`# ${title}\n\nVersão ${version}\n`)).toBe(true);
  });

  it('nao tem CR, contato a preencher nem promessa sobre HTTPS', () => {
    expect(file).not.toContain('\r');
    expect(file).not.toContain('[a preencher]');
    expect(file).not.toMatch(/https/i);
  });
});

describe('termo de uso v2 (DOC-03)', () => {
  it('so tira da v1 a promessa de copia de seguranca diaria', () => {
    const removed = '- faz cópia de segurança diária, guardada por 14 dias;\n';

    expect(TERMS_V1_CONTENT).toContain(removed);
    expect(TERMS_V2_CONTENT).not.toMatch(/cópia de segurança|14 dias/);
    expect(TERMS_V2_CONTENT).toBe(
      TERMS_V1_CONTENT.replace('\nVersão 1\n', '\nVersão 2\n').replace(
        removed,
        '',
      ),
    );
  });
});
