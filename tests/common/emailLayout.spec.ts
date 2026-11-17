import { BRAND_COLORS } from '@/common/brand/brandColors';
import {
  BUTTON_FALLBACK_TEXT,
  DEFAULT_FOOTER_NOTE,
  type EmailContent,
  escapeHtml,
  renderEmail,
} from '@/common/mail/emailLayout';
import { EMAIL_LOGO } from '@/common/mail/emailLogo';
import { COLORS } from '@/modules/ManagementReport/services/pdfLayout';

const content = (overrides: Partial<EmailContent> = {}): EmailContent => ({
  subject: 'Assunto sintetico',
  preheader: 'Resumo sintetico',
  title: 'Titulo sintetico',
  paragraphs: ['Primeiro paragrafo.', 'Segundo paragrafo.'],
  ...overrides,
});

const HOSTILE = `<script>alert("x")</script> & 'aspas'`;

describe('escapeHtml', () => {
  it('troca os cinco caracteres especiais', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('renderEmail', () => {
  it('escapa todo valor dinamico no HTML e mantem o texto puro sem escape', () => {
    const email = renderEmail(
      content({
        subject: HOSTILE,
        preheader: HOSTILE,
        title: HOSTILE,
        greeting: HOSTILE,
        highlight: {
          tone: 'info',
          label: HOSTILE,
          value: HOSTILE,
          detail: HOSTILE,
        },
        paragraphs: [HOSTILE],
        action: {
          label: HOSTILE,
          url: 'https://app.example.com/?a="b"&c=<d>',
        },
        closing: [HOSTILE],
        footerNote: HOSTILE,
        organizationName: HOSTILE,
      }),
    );

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('"x"');
    expect(email.html).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;aspas&#39;',
    );
    expect(email.html).toContain(
      'href="https://app.example.com/?a=&quot;b&quot;&amp;c=&lt;d&gt;"',
    );
    expect(email.text).toContain(HOSTILE);
    expect(email.text).not.toContain('&lt;');
  });

  it('botao a prova de cliente de e-mail, com o link tambem em texto', () => {
    const url = 'https://app.example.com/redefinir-senha?token=abc';
    const { html, text } = renderEmail(
      content({ action: { label: 'Redefinir senha', url } }),
    );

    expect(html).toContain(
      `<td align="center" bgcolor="${BRAND_COLORS.teal}" style="background-color:${BRAND_COLORS.teal};border-radius:10px;">`,
    );
    expect(html).toMatch(
      new RegExp(
        `<a href="${url.replace(/[?]/g, '\\?')}"[^>]*color:${BRAND_COLORS.white}[^>]*>Redefinir senha</a>`,
      ),
    );
    expect(html).toContain(escapeHtml(BUTTON_FALLBACK_TEXT));
    expect(html.split(`href="${url}"`)).toHaveLength(3);
    expect(html).toContain(`>${url}</a>`);
    expect(text).toContain(`Redefinir senha: ${url}`);
  });

  it('recusa link de botao fora de http/https', () => {
    expect(() =>
      renderEmail(
        content({ action: { label: 'X', url: 'javascript:alert(1)' } }),
      ),
    ).toThrow('Link de e-mail fora de http/https.');
  });

  it('texto equivalente: o mesmo conteudo, na mesma ordem, sem marcacao', () => {
    const { text } = renderEmail(
      content({
        greeting: 'Olá, Ana.',
        highlight: {
          tone: 'warning',
          label: 'Vence em',
          value: '20/11/2026',
          detail: 'Plano Basic',
        },
        action: { label: 'Acessar', url: 'https://app.example.com' },
        closing: ['Fechamento.'],
        organizationName: 'Casa Exemplo',
      }),
    );

    expect(text).toBe(
      [
        'Titulo sintetico',
        'Olá, Ana.',
        'Vence em: 20/11/2026\nPlano Basic',
        'Primeiro paragrafo.',
        'Segundo paragrafo.',
        'Acessar: https://app.example.com',
        'Fechamento.',
        `--\n${DEFAULT_FOOTER_NOTE}\nOrganização: Casa Exemplo`,
      ].join('\n\n'),
    );
    expect(text).not.toMatch(/<[a-z/]/i);
  });

  it('cores da marca: faixa navy, filete accent, nome Vita/care', () => {
    const { html } = renderEmail(content());

    expect(html).toContain(`background-color:${BRAND_COLORS.navy};`);
    expect(html).toContain(`background-color:${BRAND_COLORS.accent};`);
    expect(html).toContain(
      `Vita<span style="color:${BRAND_COLORS.accent};">care</span>`,
    );
    expect(html).toContain(
      `<body style="margin:0;padding:0;background-color:${BRAND_COLORS.surface};">`,
    );
  });

  it.each([
    ['critical', BRAND_COLORS.critical, BRAND_COLORS.criticalTint],
    ['warning', BRAND_COLORS.warning, BRAND_COLORS.warningTint],
    ['info', BRAND_COLORS.info, BRAND_COLORS.infoTint],
  ] as const)(
    'destaque %s com a cor e o fundo do estado',
    (tone, color, tint) => {
      const { html } = renderEmail(
        content({ highlight: { tone, label: 'Severidade', value: 'X' } }),
      );

      expect(html).toContain(
        `background-color:${tint};border-left:4px solid ${color};`,
      );
    },
  );

  it('rodape padrao, com aviso proprio e a organizacao quando houver', () => {
    expect(renderEmail(content()).html).toContain(
      `${escapeHtml(DEFAULT_FOOTER_NOTE)}</td>`,
    );

    const { html, text } = renderEmail(
      content({
        footerNote: 'Aviso proprio.',
        organizationName: 'Casa Exemplo',
      }),
    );

    expect(html).toContain('Aviso proprio.<br>Organização: Casa Exemplo</td>');
    expect(html).not.toContain(DEFAULT_FOOTER_NOTE);
    expect(text).toMatch(/--\nAviso proprio\.\nOrganização: Casa Exemplo$/);
  });

  it('HTML de e-mail: pt-BR, 600 px, preheader oculto, sem JS nem recurso remoto', () => {
    const { html } = renderEmail(
      content({ action: { label: 'Abrir', url: 'https://app.example.com' } }),
    );

    expect(html).toMatch(/^<!DOCTYPE html>\n<html lang="pt-BR"/);
    expect(html).toContain('max-width:600px;');
    expect(html).toContain('<table role="presentation" width="600"');
    expect(html).toMatch(
      /<div style="display:none;[^"]*mso-hide:all;[^"]*">Resumo sintetico<\/div>/,
    );
    expect(html).not.toMatch(/<script|<link|@import|@font-face|url\(/i);
    expect(html).not.toMatch(/ on[a-z]+=/i);
    // Unico recurso externo e o link do botao; a logo vem do anexo.
    expect(html.match(/(?:src|href)="[^"]*"/g)).toEqual([
      `src="cid:${EMAIL_LOGO.cid}"`,
      'href="https://app.example.com"',
      'href="https://app.example.com"',
    ]);
  });

  it('logo como anexo inline por CID, PNG valido', () => {
    const { html, attachments } = renderEmail(content());

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      cid: EMAIL_LOGO.cid,
      filename: 'vitacare.png',
      contentType: 'image/png',
    });
    expect(attachments[0].content.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(attachments[0].content.readUInt32BE(16)).toBe(EMAIL_LOGO.width);
    expect(attachments[0].content.readUInt32BE(20)).toBe(EMAIL_LOGO.height);
    expect(html).toContain(
      `src="cid:${EMAIL_LOGO.cid}" width="57" height="32"`,
    );
  });

  it('PDF e e-mail usam a mesma paleta', () => {
    expect(COLORS).toBe(BRAND_COLORS);
  });
});
