import {
  contentDisposition,
  detectAttachmentType,
  sanitizeFileName,
} from '@/modules/Attachment/policies/attachmentContent.policy';

const bytes = (...values: number[]) => Buffer.from(values);

describe('detectAttachmentType', () => {
  it.each([
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46)],
    [
      'image/png',
      bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d),
    ],
    [
      'image/webp',
      Buffer.from('RIFF\u0024\u0000\u0000\u0000WEBPVP8 ', 'latin1'),
    ],
    ['application/pdf', Buffer.from('%PDF-1.7\n%', 'latin1')],
  ])('reconhece %s pela assinatura', (type, head) => {
    expect(detectAttachmentType(head)).toBe(type);
  });

  it('recusa texto com extensao de imagem', () => {
    expect(detectAttachmentType(Buffer.from('hello world.jpg'))).toBeNull();
  });

  it('recusa cabecalho curto demais', () => {
    expect(detectAttachmentType(bytes(0xff, 0xd8))).toBeNull();
  });

  it('recusa RIFF que nao e WEBP', () => {
    expect(
      detectAttachmentType(Buffer.from('RIFF\u0024\u0000\u0000\u0000WAVEfmt ')),
    ).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('fica so com o nome final de um caminho POSIX', () => {
    expect(sanitizeFileName('../../etc/passwd', 'image/png')).toBe('passwd');
  });

  it('fica so com o nome final de um caminho Windows', () => {
    expect(sanitizeFileName('C:\\fotos\\ferida.jpg', 'image/jpeg')).toBe(
      'ferida.jpg',
    );
  });

  it('usa nome padrao quando sobra so espaco ou controle', () => {
    expect(sanitizeFileName('  \u0000\u001f ', 'image/png')).toBe('anexo.png');
    expect(sanitizeFileName(undefined, 'application/pdf')).toBe('anexo.pdf');
    expect(sanitizeFileName('..', 'image/webp')).toBe('anexo.webp');
  });

  it('corta em 255 caracteres preservando a extensao', () => {
    const name = sanitizeFileName(`${'a'.repeat(296)}.pdf`, 'application/pdf');

    expect(name).toHaveLength(255);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('contentDisposition', () => {
  it('manda nome ASCII seguro e nome UTF-8 codificado', () => {
    const header = contentDisposition('ferida "nova" ç.jpg');

    expect(header).toBe(
      `attachment; filename="ferida _nova_ _.jpg"; filename*=UTF-8''ferida%20%22nova%22%20%C3%A7.jpg`,
    );
  });
});
