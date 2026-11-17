import { BRAND_COLORS as C } from '@/common/brand/brandColors';

import { EMAIL_LOGO } from './emailLogo';

export type EmailTone = 'critical' | 'warning' | 'info';

/** Bloco de destaque: severidade de alerta ou estado (vencimento do plano). */
export interface EmailHighlight {
  tone: EmailTone;
  label: string;
  value: string;
  detail?: string;
}

/** Botao principal; o link tambem sai em texto logo abaixo. */
export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailContent {
  subject: string;
  /** Resumo que a caixa de entrada mostra ao lado do assunto; oculto no corpo. */
  preheader: string;
  title: string;
  greeting?: string;
  highlight?: EmailHighlight;
  paragraphs: readonly string[];
  action?: EmailAction;
  /** Paragrafos depois do botao. */
  closing?: readonly string[];
  /** Aviso do rodape; sem ele, `DEFAULT_FOOTER_NOTE`. */
  footerNote?: string;
  organizationName?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
}

export const DEFAULT_FOOTER_NOTE =
  'E-mail automático do VitaCare. Não responda esta mensagem.';

export const BUTTON_FALLBACK_TEXT =
  'Se o botão não funcionar, copie e cole este endereço no navegador:';

const TONES: Readonly<Record<EmailTone, { color: string; tint: string }>> = {
  critical: { color: C.critical, tint: C.criticalTint },
  warning: { color: C.warning, tint: C.warningTint },
  info: { color: C.info, tint: C.infoTint },
};

const FONT = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";
const LOGO_HEIGHT = 32;
const LOGO_WIDTH = Math.round(
  (EMAIL_LOGO.width * LOGO_HEIGHT) / EMAIL_LOGO.height,
);

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Todo valor que entra no HTML passa por aqui: nada de HTML vindo de dado. */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ENTITIES[char]);

/** Link de botao so em http/https; outro esquema e erro de configuracao. */
const checkedUrl = (url: string): string => {
  const { protocol } = new URL(url);

  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error('Link de e-mail fora de http/https.');
  }

  return url;
};

const paragraph = (text: string, style = ''): string =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.navy};${style}">${escapeHtml(text)}</p>`;

const header = (): string => `
<tr><td style="background-color:${C.navy};border-radius:16px 16px 0 0;padding:20px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background-color:${C.white};border-radius:10px;padding:6px 8px;"><img src="cid:${EMAIL_LOGO.cid}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="" style="display:block;border:0;outline:none;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;"></td>
<td style="padding-left:12px;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${C.white};">Vita<span style="color:${C.accent};">care</span></td>
</tr></table>
</td></tr>
<tr><td height="4" style="height:4px;background-color:${C.accent};font-size:0;line-height:0;">&nbsp;</td></tr>`;

const highlightBlock = (highlight: EmailHighlight): string => {
  const tone = TONES[highlight.tone];

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
<td style="background-color:${tone.tint};border-left:4px solid ${tone.color};border-radius:10px;padding:14px 16px;font-family:${FONT};">
<p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.04em;color:${tone.color};">${escapeHtml(highlight.label)}</p>
<p style="margin:4px 0 0;font-size:17px;font-weight:700;color:${tone.color};">${escapeHtml(highlight.value)}</p>${
    highlight.detail
      ? `\n<p style="margin:6px 0 0;font-size:15px;color:${C.navy};">${escapeHtml(highlight.detail)}</p>`
      : ''
  }
</td></tr></table>`;
};

const actionBlock = (action: EmailAction): string => {
  const href = escapeHtml(checkedUrl(action.url));

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr>
<td align="center" bgcolor="${C.teal}" style="background-color:${C.teal};border-radius:10px;">
<a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:${C.white};text-decoration:none;border-radius:10px;">${escapeHtml(action.label)}</a>
</td></tr></table>
<p style="margin:0 0 20px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted};">${escapeHtml(BUTTON_FALLBACK_TEXT)}<br><a href="${href}" target="_blank" rel="noopener" style="color:${C.teal};word-break:break-all;">${href}</a></p>`;
};

const footerLines = (content: EmailContent): string[] => [
  content.footerNote ?? DEFAULT_FOOTER_NOTE,
  ...(content.organizationName
    ? [`Organização: ${content.organizationName}`]
    : []),
];

const renderHtml = (content: EmailContent): string => {
  const body = [
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${C.navy};">${escapeHtml(content.title)}</h1>`,
    ...(content.greeting ? [paragraph(content.greeting)] : []),
    ...(content.highlight ? [highlightBlock(content.highlight)] : []),
    ...content.paragraphs.map((text) => paragraph(text)),
    ...(content.action ? [actionBlock(content.action)] : []),
    ...(content.closing ?? []).map((text) => paragraph(text)),
  ].join('\n');
  const footer = footerLines(content).map(escapeHtml).join('<br>');

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
<!--[if mso]><style>table,td,p,a,h1{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${C.surface};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.surface};">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.surface};">
<tr><td align="center" style="padding:24px 16px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">${header()}
<tr><td style="background-color:${C.white};border-radius:0 0 16px 16px;padding:32px;">
${body}
</td></tr>
<tr><td style="padding:20px 32px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};text-align:center;">${footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
};

/** Versao em texto puro, do mesmo conteudo: o fallback de todo cliente. */
const renderText = (content: EmailContent): string => {
  const blocks: string[] = [content.title];

  if (content.greeting) blocks.push(content.greeting);
  if (content.highlight) {
    const { label, value, detail } = content.highlight;

    blocks.push(`${label}: ${value}${detail ? `\n${detail}` : ''}`);
  }
  blocks.push(...content.paragraphs);
  if (content.action) {
    blocks.push(`${content.action.label}: ${checkedUrl(content.action.url)}`);
  }
  blocks.push(...(content.closing ?? []));
  blocks.push(['--', ...footerLines(content)].join('\n'));

  return blocks.join('\n\n');
};

/**
 * Layout unico dos e-mails do VitaCare: faixa navy com a logo (anexo inline
 * por CID) e o nome, titulo, destaque opcional, botao e rodape padrao, em
 * tabelas com CSS inline e ate 600 px, sem JS nem fonte remota. Funcao pura: o
 * mesmo conteudo gera o HTML e o texto.
 */
export const renderEmail = (content: EmailContent): RenderedEmail => ({
  subject: content.subject,
  html: renderHtml(content),
  text: renderText(content),
  attachments: [
    {
      filename: EMAIL_LOGO.filename,
      content: Buffer.from(EMAIL_LOGO.base64, 'base64'),
      contentType: EMAIL_LOGO.contentType,
      cid: EMAIL_LOGO.cid,
    },
  ],
});
