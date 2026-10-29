import { buildDataSourceOptions } from '@/database/typeorm.options';

describe('buildDataSourceOptions', () => {
  const options = buildDataSourceOptions({
    host: 'postgresql',
    port: 5432,
    username: 'vitacare',
    password: 'x',
    database: 'vitacare',
    schema: 'public',
    ssl: false,
    sslRejectUnauthorized: true,
    poolSize: 5,
    poolIdleTimeoutMs: 30000,
    statementTimeoutMs: 30000,
    applicationName: 'vitacare-backend',
    connectTimeoutMs: 10000,
    migrationsTableName: 'migrations',
  });

  it('repassa o dimensionamento do pool ao driver pg', () => {
    expect(options.extra).toEqual({
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
      application_name: 'vitacare-backend',
    });
  });

  it('nunca altera o schema sozinho', () => {
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });
});
