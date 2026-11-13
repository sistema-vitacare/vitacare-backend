import {
  escapeHtml,
  renderTermsMarkdown,
} from '../policies/termsMarkdown.policy';
import type { TermsVersionRow } from '../types/terms.types';

const DATE_IN_BRAZIL = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Sem script nem recurso externo: o CSP padrao do Helmet aceita o estilo inline. */
const STYLE = `
  :root { color-scheme: light dark; --text: #1f2933; --muted: #52606d; --line: #d9e2ec; --bg: #ffffff; --accent: #0b6e4f; }
  @media (prefers-color-scheme: dark) { :root { --text: #e4e7eb; --muted: #9aa5b1; --line: #3e4c59; --bg: #1f2933; --accent: #3ebd93; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 46rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 .25rem; color: var(--accent); }
  h2 { font-size: 1.2rem; margin: 2rem 0 .5rem; padding-top: 1rem; border-top: 1px solid var(--line); }
  p, li { overflow-wrap: anywhere; }
  ul, ol { padding-left: 1.4rem; }
  li { margin: .3rem 0; }
  .meta { color: var(--muted); font-size: .9rem; margin: 0 0 1.5rem; }
  footer { margin-top: 2.5rem; color: var(--muted); font-size: .8rem; overflow-wrap: anywhere; }
`;

const page = (title: string, body: string): string =>
  [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    `<main>${body}</main>`,
    '</body>',
    '</html>',
  ].join('\n');

/**
 * Pagina publica do termo (BE-32): o mesmo texto do JSON, renderizado do
 * Markdown versionado. Sem versao, mostra a mensagem recebida.
 */
export const renderTermsPage = (
  row: TermsVersionRow | null,
  emptyMessage = 'Termo ainda não publicado.',
): string => {
  if (!row) {
    return page(
      'Termo de uso — VitaCare',
      `<p>${escapeHtml(emptyMessage)}</p>`,
    );
  }

  const meta = `<p class="meta">Versão ${row.version} · publicada em ${DATE_IN_BRAZIL.format(row.publishedAt)}</p>`;
  const [heading, ...rest] = renderTermsMarkdown(row.content).split('\n');
  const body = heading.startsWith('<h1>')
    ? [heading, meta, ...rest].join('\n')
    : [meta, heading, ...rest].join('\n');

  return page(
    row.title,
    `${body}\n<footer>Identificação do texto (SHA-256): ${row.contentHash}</footer>`,
  );
};
