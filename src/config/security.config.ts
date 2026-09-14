import { registerAs } from '@nestjs/config';
import { toBoolean, toList } from './config.utils';

export default registerAs('security', () => ({
  corsOrigins: toList(process.env.CORS_ORIGINS),
  corsCredentials: toBoolean(process.env.CORS_CREDENTIALS, false),
  throttleTtlMs: Number(process.env.THROTTLE_TTL_MS ?? 60000),
  throttleLimit: Number(process.env.THROTTLE_LIMIT ?? 120),
}));
