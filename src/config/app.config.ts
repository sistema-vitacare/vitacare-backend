import { registerAs } from '@nestjs/config';
import { toBoolean } from './config.utils';

export default registerAs('app', () => ({
  environment: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? '1',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  swaggerEnabled: toBoolean(process.env.SWAGGER_ENABLED, true),
  swaggerPath: process.env.SWAGGER_PATH ?? 'docs',
}));
