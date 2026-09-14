import { registerAs } from '@nestjs/config';
import { toBoolean } from './config.utils';

export default registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  schema: process.env.DB_SCHEMA ?? 'public',
  ssl: toBoolean(process.env.DB_SSL, false),
  sslRejectUnauthorized: toBoolean(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
    true,
  ),
  poolSize: Number(process.env.DB_POOL_SIZE ?? 10),
  connectTimeoutMs: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10000),
  migrationsTableName: process.env.DB_MIGRATIONS_TABLE ?? 'migrations',
}));
