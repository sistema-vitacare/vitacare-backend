import type { AttachmentContentType } from '../types/attachment.types';

const SIGNATURES: ReadonlyArray<{
  type: AttachmentContentType;
  matches: (head: Buffer) => boolean;
}> = [
  {
    type: 'image/jpeg',
    matches: (head) =>
      head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    type: 'image/png',
    matches: (head) =>
      head
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    type: 'image/webp',
    matches: (head) =>
      head.toString('latin1', 0, 4) === 'RIFF' &&
      head.toString('latin1', 8, 12) === 'WEBP',
  },
  {
    type: 'application/pdf',
    matches: (head) => head.toString('latin1', 0, 5) === '%PDF-',
  },
];

/** Bytes que bastam para reconhecer qualquer tipo aceito. */
export const ATTACHMENT_SIGNATURE_BYTES = 12;

const EXTENSIONS: Readonly<Record<AttachmentContentType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const MAX_NAME_LENGTH = 255;

/** Tipo pela assinatura do conteudo; extensao e Content-Type do cliente nao contam. */
export const detectAttachmentType = (
  head: Buffer,
): AttachmentContentType | null =>
  SIGNATURES.find((signature) => signature.matches(head))?.type ?? null;

/**
 * Rotulo exibido e devolvido no download. Nunca participa do caminho do
 * arquivo, mas sai em header: sem diretorio nem caractere de controle.
 */
export const sanitizeFileName = (
  original: string | undefined,
  type: AttachmentContentType,
): string => {
  const base = (original ?? '').split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();

  if (clean === '' || /^\.+$/.test(clean)) return `anexo.${EXTENSIONS[type]}`;
  if (clean.length <= MAX_NAME_LENGTH) return clean;

  const dot = clean.lastIndexOf('.');
  const extension = dot > 0 && clean.length - dot <= 16 ? clean.slice(dot) : '';

  return clean.slice(0, MAX_NAME_LENGTH - extension.length) + extension;
};

/** Sempre `attachment`: o navegador baixa, nao interpreta o conteudo. */
export const contentDisposition = (fileName: string): string => {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};
