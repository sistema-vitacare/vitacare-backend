import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from './snakeNaming.strategy';

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
  poolIdleTimeoutMs: number;
  statementTimeoutMs: number;
  applicationName: string;
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
  // Codigo em camelCase, banco em snake_case, sem `name:` em cada @Column.
  namingStrategy: new SnakeNamingStrategy(),
  // O banco e externo: nada de alteracao automatica de schema.
  synchronize: false,
  migrationsRun: false,
  migrationsTableName: settings.migrationsTableName,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  // Pool do `pg` por processo. Cada replica abre ate `max` conexoes no
  // Postgres compartilhado: replicas x DB_POOL_SIZE tem que caber no
  // max_connections junto com os outros sistemas da VPS.
  extra: {
    max: settings.poolSize,
    // Conexao ociosa e devolvida ao Postgres: fora do pico o pool encolhe.
    idleTimeoutMillis: settings.poolIdleTimeoutMs,
    connectionTimeoutMillis: settings.connectTimeoutMs,
    // Consulta travada morre no banco ANTES do request HTTP expirar, e o erro
    // chega ao log em vez de um 504 sem rastro.
    statement_timeout: settings.statementTimeoutMs,
    // Identifica a origem em pg_stat_activity no Postgres compartilhado.
    application_name: settings.applicationName,
  },
});
