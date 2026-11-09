import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { AddDashboardIndexes1791600000000 } from '@/database/migrations/1791600000000-AddDashboardIndexes';
import { AuditEventQuery1791700000000 } from '@/database/migrations/1791700000000-AuditEventQuery';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

import { ALL_MIGRATIONS } from '../Automation/automation.fixtures';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

export const MIGRATIONS_BEFORE_AUDIT = [
  ...ALL_MIGRATIONS,
  AddDashboardIndexes1791600000000,
];

export const MIGRATIONS_WITH_AUDIT = [
  ...MIGRATIONS_BEFORE_AUDIT,
  AuditEventQuery1791700000000,
];

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
