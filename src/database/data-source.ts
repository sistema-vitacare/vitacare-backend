import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import databaseConfig from '../config/database.config';
import { buildDataSourceOptions } from './typeorm.options';

loadEnv({ path: process.env.ENV_FILE ?? '.env', quiet: true });

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
};

const settings = databaseConfig();

/**
 * DataSource consumido exclusivamente pela CLI do TypeORM (migrations).
 * A aplicacao usa o DatabaseModule, nao este arquivo.
 */
export default new DataSource(
  buildDataSourceOptions({
    ...settings,
    host: required('DB_HOST', settings.host),
    username: required('DB_USERNAME', settings.username),
    password: required('DB_PASSWORD', settings.password),
    database: required('DB_DATABASE', settings.database),
  }),
);
