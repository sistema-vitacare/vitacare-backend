import { registerAs } from '@nestjs/config';
import { toBoolean, toTrustProxy } from './config.utils';

export default registerAs('app', () => ({
  environment: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? '1',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  swaggerEnabled: toBoolean(process.env.SWAGGER_ENABLED, true),
  swaggerPath: process.env.SWAGGER_PATH ?? 'docs',
  /** Commit gravado na imagem pelo build (`GIT_SHA`); `dev` fora dela. */
  version: process.env.APP_VERSION || 'dev',
  /** Proxies confiaveis para ler o IP real em X-Forwarded-For. */
  trustProxy: toTrustProxy(process.env.TRUST_PROXY),
  /**
   * Timeouts do servidor HTTP do Node. O keep-alive fica ACIMA do keepalive do
   * gateway (30s): se o Node fechasse primeiro, o nginx reaproveitaria um
   * socket morto e responderia 502.
   */
  keepAliveTimeoutMs: Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS ?? 65000),
  requestTimeoutMs: Number(process.env.HTTP_REQUEST_TIMEOUT_MS ?? 60000),
}));
