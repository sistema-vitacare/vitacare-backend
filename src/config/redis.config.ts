import { registerAs } from '@nestjs/config';
import { toBoolean } from './config.utils';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT ?? 6379),
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  database: Number(process.env.REDIS_DB ?? 0),
  tls: toBoolean(process.env.REDIS_TLS, false),
  connectTimeoutMs: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 10000),
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'vitacare:',
  queuePrefix: process.env.QUEUE_PREFIX ?? 'vitacare',
}));
