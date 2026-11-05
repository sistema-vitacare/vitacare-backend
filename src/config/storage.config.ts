import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  /** Raiz dos arquivos privados; na imagem, o volume montado em /app/storage. */
  path: process.env.STORAGE_PATH ?? './storage',
}));
