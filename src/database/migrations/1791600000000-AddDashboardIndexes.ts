import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-22 (2026-11-09): indices para o painel operacional agregar por
 * organizacao e periodo sem depender dos indices por paciente. Registros
 * contam pela visita e so validos; alertas pela geracao, e os pendentes por
 * severidade. So indices: nenhuma coluna ou dado muda.
 */
export class AddDashboardIndexes1791600000000 implements MigrationInterface {
  name = 'AddDashboardIndexes1791600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `CREATE INDEX follow_up_records_org_visit_idx ON ${table('follow_up_records')} (organization_id, visited_at) WHERE status = 'valid'`,
    );
    await queryRunner.query(
      `CREATE INDEX alerts_org_generated_idx ON ${table('alerts')} (organization_id, generated_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX alerts_org_open_idx ON ${table('alerts')} (organization_id, severity, generated_at DESC) WHERE status = 'open'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner);

    for (const index of [
      'alerts_org_open_idx',
      'alerts_org_generated_idx',
      'follow_up_records_org_visit_idx',
    ]) {
      await queryRunner.query(`DROP INDEX ${schema}."${index}"`);
    }
  }

  private schema(queryRunner: QueryRunner): string {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');

    return `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
  }

  private tableName(queryRunner: QueryRunner): (name: string) => string {
    const schema = this.schema(queryRunner);

    return (name: string) => `${schema}."${name}"`;
  }
}
