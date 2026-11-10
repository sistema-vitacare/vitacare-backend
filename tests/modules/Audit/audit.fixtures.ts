import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

import { ALL_MIGRATIONS } from '../Automation/automation.fixtures';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

/** `ALL_MIGRATIONS` termina na migration do BE-23. */
export const MIGRATIONS_WITH_AUDIT = ALL_MIGRATIONS;

export const MIGRATIONS_BEFORE_AUDIT = ALL_MIGRATIONS.slice(0, -1);

export const auditDataSource = (
  url: string,
  migrations: Array<new () => unknown> = MIGRATIONS_WITH_AUDIT,
) =>
  new DataSource({
    type: 'postgres',
    url,
    entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
    migrations: migrations as never,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
  });
