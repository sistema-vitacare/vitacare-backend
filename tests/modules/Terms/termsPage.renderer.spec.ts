import { renderTermsPage } from '@/modules/Terms/services/termsPage.renderer';
import type { TermsVersionRow } from '@/modules/Terms/types/terms.types';

const row = (overrides: Partial<TermsVersionRow> = {}): TermsVersionRow => ({
  id: '0b7f1f3e-0000-4000-8000-000000000001',
  version: 3,
  title: 'Termo <Exemplo>',
  content: '# Termo <Exemplo>\n\nTexto com **destaque**.',
  contentHash: 'a'.repeat(64),
  // 02:30 UTC ainda e o dia 12 em Brasilia.
  publishedAt: new Date('2026-11-13T02:30:00Z'),
  ...overrides,
});

describe('renderTermsPage (BE-32)', () => {
  it('monta um documento HTML completo em portugues, sem script', () => {
    const html = renderTermsPage(row());

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport"');
    expect(html).not.toContain('<script');
  });

  it('mostra titulo escapado, versao, data de Brasilia e o texto', () => {
    const html = renderTermsPage(row());

    expect(html).toContain('<title>Termo &lt;Exemplo&gt;</title>');
    expect(html).toContain('Versão 3');
    expect(html).toContain('12/11/2026');
    expect(html).toContain('<strong>destaque</strong>');
    expect(html).toContain('a'.repeat(64));
  });

  it('sem versao publicada, avisa que o termo ainda nao foi publicado', () => {
    const html = renderTermsPage(null);

    expect(html).toContain('Termo ainda não publicado');
    expect(html).not.toContain('Versão');
  });

  it('aceita outra mensagem para versao inexistente', () => {
    expect(renderTermsPage(null, 'Versão do termo não encontrada.')).toContain(
      'Versão do termo não encontrada.',
    );
  });
});
