import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { AuditEventQuery1791700000000 } from '@/database/migrations/1791700000000-AuditEventQuery';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

import { ALL_MIGRATIONS } from '../Automation/automation.fixtures';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const AUDIT_INDEX = ALL_MIGRATIONS.indexOf(AuditEventQuery1791700000000);

/** Ate a migration do BE-23, inclusive; as posteriores ficam de fora. */
export const MIGRATIONS_WITH_AUDIT = ALL_MIGRATIONS.slice(0, AUDIT_INDEX + 1);

export const MIGRATIONS_BEFORE_AUDIT = ALL_MIGRATIONS.slice(0, AUDIT_INDEX);

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
