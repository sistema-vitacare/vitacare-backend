/**
 * Conversor do subconjunto de Markdown usado no termo (BE-32): `#` e `##`,
 * paragrafos, listas `-` e `1.` e negrito `**`. O texto e escapado antes de
 * qualquer marcacao, entao nada do termo vira tag. Qualquer outra sintaxe sai
 * como texto literal; o termo e escrito para caber neste subconjunto.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ESCAPES[char]);

const inline = (text: string): string =>
  escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

type ListKind = 'ul' | 'ol';

const LIST_ITEM: Record<ListKind, RegExp> = {
  ul: /^- (.*)$/,
  ol: /^\d+\. (.*)$/,
};

export const renderTermsMarkdown = (markdown: string): string => {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: { kind: ListKind; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.map(inline).join('\n')}</p>`);
      paragraph = [];
    }

    if (list) {
      const items = list.items.map((item) => `<li>${inline(item)}</li>`);

      blocks.push(`<${list.kind}>${items.join('')}</${list.kind}>`);
      list = null;
    }
  };

  for (const line of markdown.split('\n')) {
    const heading = /^(#{1,2}) (.*)$/.exec(line);
    const kind = (Object.keys(LIST_ITEM) as ListKind[]).find((key) =>
      LIST_ITEM[key].test(line),
    );

    if (line.trim() === '') {
      flush();
    } else if (heading) {
      flush();
      const level = heading[1].length;

      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (kind) {
      if (paragraph.length || (list && list.kind !== kind)) flush();

      list ??= { kind, items: [] };
      list.items.push(LIST_ITEM[kind].exec(line)![1]);
    } else {
      if (list) flush();

      paragraph.push(line);
    }
  }

  flush();

  return blocks.join('\n');
};
