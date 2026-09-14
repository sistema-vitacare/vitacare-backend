import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export interface DatabaseSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  schema: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  poolSize: number;
  connectTimeoutMs: number;
  migrationsTableName: string;
}

/**
 * Fonte unica das opcoes do TypeORM, usada tanto pelo DatabaseModule quanto
 * pelo DataSource da CLI. Os globs sao resolvidos a partir de __dirname, entao
 * funcionam em src/ (ts-node) e em dist/ (build) sem alteracao.
 */
export const buildDataSourceOptions = (
  settings: DatabaseSettings,
): DataSourceOptions => ({
  type: 'postgres',
  host: settings.host,
  port: settings.port,
  username: settings.username,
  password: settings.password,
  database: settings.database,
  schema: settings.schema,
  ssl: settings.ssl
    ? { rejectUnauthorized: settings.sslRejectUnauthorized }
    : false,
  // O banco e externo: nada de alteracao automatica de schema.
  synchronize: false,
  migrationsRun: false,
  migrationsTableName: settings.migrationsTableName,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  extra: {
    max: settings.poolSize,
    connectionTimeoutMillis: settings.connectTimeoutMs,
  },
});
