import type { Options } from 'pino-http';

import { redactRequestLog } from './logRedaction';
import { requestIdFromHeaders } from './requestId';

/**
 * O Alloy da VPS cria o label `level` do Loki a partir de `level_name`, no
 * vocabulario do Monolog dos sistemas Laravel; sem ele, os alertas de erro por
 * stack nao enxergam a API.
 */
const MONOLOG_LEVEL_NAMES: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export const monologLevelName = (label: string): string =>
  MONOLOG_LEVEL_NAMES[label] ?? label.toUpperCase();

// pino-pretty e devDependency: a imagem de runtime instala com --omit=dev e nao
// o tem. Fora de producao usamos o log formatado quando o pacote existe e
// caimos em JSON puro quando nao existe, em vez de derrubar o boot.
function prettyTransport() {
  try {
    require.resolve('pino-pretty');
    return { target: 'pino-pretty', options: { singleLine: true } };
  } catch {
    return undefined;
  }
}

export const buildHttpLoggerOptions = (input: {
  level: string;
  environment: string;
}): Options => ({
  level: input.level,
  // Em producao o log vai em JSON puro para o coletor de logs.
  transport: input.environment === 'production' ? undefined : prettyTransport(),
  formatters: {
    level: (label, number) => ({
      level: number,
      level_name: monologLevelName(label),
    }),
  },
  genReqId: requestIdFromHeaders,
  serializers: { req: redactRequestLog },
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    // Nome original do anexo enviado pelo cuidador: pode conter nome de paciente.
    'res.headers["content-disposition"]',
  ],
  autoLogging: {
    ignore: (req: { url?: string }) =>
      req.url === '/health/live' || req.url === '/health/ready',
  },
});
