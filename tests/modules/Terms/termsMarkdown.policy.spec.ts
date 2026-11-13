import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderTermsMarkdown } from '@/modules/Terms/policies/termsMarkdown.policy';

const TERMS_FILE = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'termos',
  'termo-de-uso-v1.md',
);

describe('renderTermsMarkdown (BE-32)', () => {
  it('converte cabecalhos de nivel 1 e 2', () => {
    expect(renderTermsMarkdown('# Titulo\n\n## Secao')).toBe(
      '<h1>Titulo</h1>\n<h2>Secao</h2>',
    );
  });

  it('junta linhas seguidas num paragrafo e separa paragrafos pela linha em branco', () => {
    expect(renderTermsMarkdown('a\nb\n\nc')).toBe('<p>a\nb</p>\n<p>c</p>');
  });

  it('converte listas com marcador e numeradas', () => {
    expect(renderTermsMarkdown('- a\n- b\n\n1. c\n2. d')).toBe(
      '<ul><li>a</li><li>b</li></ul>\n<ol><li>c</li><li>d</li></ol>',
    );
  });

  it('fecha a lista quando vem um paragrafo logo depois', () => {
    expect(renderTermsMarkdown('Antes:\n\n- a\nDepois')).toBe(
      '<p>Antes:</p>\n<ul><li>a</li></ul>\n<p>Depois</p>',
    );
  });

  it('converte negrito dentro do texto', () => {
    expect(renderTermsMarkdown('um **dois** tres')).toBe(
      '<p>um <strong>dois</strong> tres</p>',
    );
  });

  it('escapa HTML antes de aplicar a marcacao', () => {
    expect(renderTermsMarkdown(`<script>&"'</script> **<b>**`)).toBe(
      '<p>&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt; <strong>&lt;b&gt;</strong></p>',
    );
  });

  it('renderiza o termo v1 inteiro sem sobra de marcacao', () => {
    const html = renderTermsMarkdown(readFileSync(TERMS_FILE, 'utf8'));

    expect(
      html.startsWith('<h1>Termo de Uso e Privacidade do VitaCare</h1>'),
    ).toBe(true);
    expect(html).not.toContain('**');
    expect(html).not.toMatch(/^[-#]/m);
    expect(html).not.toContain('<script');
    expect(html.match(/<h2>/g)).toHaveLength(11);
  });
});
