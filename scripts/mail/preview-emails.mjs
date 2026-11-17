#!/usr/bin/env node
// Previa dos quatro e-mails do VitaCare com dados sinteticos (layout de
// src/common/mail/emailLayout.ts). Usa o codigo compilado: rode `npm run build`
// antes.
//
//   node scripts/mail/preview-emails.mjs [--out <dir>]
//     grava um .html e um .txt por e-mail (padrao: <tmp>/vitacare-email-preview);
//     no arquivo, a logo (anexo CID) vira data URI para abrir no navegador.
//
//   node scripts/mail/preview-emails.mjs --smtp 127.0.0.1:1025 [--to <endereco>]
//     tambem envia os quatro a um SMTP local de teste (Mailpit), sem TLS e sem
//     autenticacao, como sairiam da API.
//
//   node scripts/mail/preview-emails.mjs --smtp smtp.hostinger.com:465 --secure \
//     --from no-reply@vitacare.bizys.com.br --to <seu-endereco>
//     envia por um SMTP real com TLS; usuario e senha vem de SMTP_USER e
//     SMTP_PASSWORD no ambiente (nunca na linha de comando). So para a sua
//     propria caixa: os dados sao sinteticos, mas o envio e real. Use
//     --app-url com o endereco real do app (link para dominio inexistente, como
//     o padrao .test, e barrado como phishing pelo filtro de saida da
//     Hostinger) e --only para mandar um e-mail por vez.
//
//   --only recuperacao-senha,convite   so os e-mails listados (nomes dos arquivos)
//   --app-url https://...              base dos links (padrao app.example.test)
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const dist = (path) => require(resolve('dist', path));

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: join(tmpdir(), 'vitacare-email-preview') },
    smtp: { type: 'string' },
    to: { type: 'string', default: 'destinatario@example.test' },
    from: { type: 'string', default: 'no-reply@example.test' },
    secure: { type: 'boolean', default: false },
    only: { type: 'string' },
    'app-url': { type: 'string', default: 'https://app.example.test' },
  },
});

const { passwordRecoveryEmail } = dist(
  'modules/Auth/policies/passwordRecoveryEmail.policy.js',
);
const { notificationMessage } = dist(
  'modules/Notification/policies/notificationMessage.policy.js',
);
const { planExpiryEmail } = dist(
  'modules/PlanExpiryNotice/policies/planExpiryEmail.policy.js',
);
const { invitationEmail } = dist(
  'modules/User/policies/invitationEmail.policy.js',
);

const APP = values['app-url'].replace(/\/+$/, '');
const now = new Date();
const inDays = (days) => new Date(now.getTime() + days * 86_400_000);

const emails = {
  'recuperacao-senha': passwordRecoveryEmail({
    resetUrl: `${APP}/redefinir-senha?token=token-sintetico`,
    expiresInMinutes: 30,
  }),
  'alerta-critico': notificationMessage({
    source: 'reading',
    severity: 'critical',
    patientName: 'Maria Sintética',
    appUrl: APP,
  }).email,
  'alerta-ausencia': notificationMessage({
    source: 'absence',
    severity: 'warning',
    patientName: 'José Sintético',
    appUrl: APP,
  }).email,
  'lembrete-medicamento': notificationMessage({
    source: 'medication_reminder',
    severity: 'info',
    patientName: 'José Sintético',
    appUrl: APP,
  }).email,
  'plano-vence-7-dias': planExpiryEmail({
    milestone: 'seven_days',
    termEndsAt: inDays(7),
    organizationName: 'Casa de Cuidado Exemplo',
    planName: 'Basic',
    now,
    appUrl: APP,
  }),
  'plano-venceu': planExpiryEmail({
    milestone: 'expired',
    termEndsAt: inDays(-1),
    organizationName: 'Casa de Cuidado Exemplo',
    planName: 'Enterprise',
    now,
    appUrl: APP,
  }),
  convite: invitationEmail({
    to: values.to,
    userName: 'Ana Exemplo',
    organizationName: 'Casa de Cuidado Exemplo',
    organizationCode: 'casa-exemplo',
    inviterName: 'Paula Administradora',
    profileName: 'Cuidador',
    acceptUrl: `${APP}/aceitar-convite?token=token-sintetico`,
    expiresAt: inDays(3),
  }),
};

const only = values.only?.split(',').map((name) => name.trim());
const unknown = only?.filter((name) => !(name in emails)) ?? [];

if (unknown.length) {
  throw new Error(
    `E-mail desconhecido: ${unknown.join(', ')}. Use: ${Object.keys(emails).join(', ')}`,
  );
}

const selected = Object.entries(emails).filter(
  ([name]) => !only || only.includes(name),
);

await mkdir(values.out, { recursive: true });

for (const [name, email] of selected) {
  let html = email.html;

  for (const file of email.attachments) {
    html = html.replaceAll(
      `cid:${file.cid}`,
      `data:${file.contentType};base64,${file.content.toString('base64')}`,
    );
  }
  await writeFile(join(values.out, `${name}.html`), html);
  await writeFile(join(values.out, `${name}.txt`), email.text);
}
console.log(`Previas gravadas em ${values.out}`);

if (values.smtp) {
  const [host, port] = values.smtp.split(':');
  const nodemailer = require('nodemailer');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const transport = nodemailer.createTransport({
    host,
    port: Number(port ?? 1025),
    secure: values.secure,
    ...(values.secure ? {} : { ignoreTLS: true }),
    ...(user && pass ? { auth: { user, pass } } : {}),
  });

  for (const [name, email] of selected) {
    const info = await transport.sendMail({
      from: values.from,
      to: values.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    });

    console.log(`${name}: aceito pelo SMTP (${info.response})`);
  }
  console.log(
    'Aceito pelo SMTP nao quer dizer entregue: confira a caixa e os avisos de devolucao.',
  );
}
