import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-30 (2026-11-12, decisao de Mateus): `management_reports:generate` libera os
 * relatorios gerenciais do plano Enterprise em `/api/v1/management-reports`. Vai
 * so para o perfil `admin` das organizacoes cliente; organizacoes novas a
 * recebem pelo provisionamento. So catalogo e concessao: nenhuma coluna muda.
 * Migration nao importa codigo da aplicacao.
 */
const MANAGEMENT_REPORTS_PERMISSION = {
  code: 'management_reports:generate',
  name: 'Gerar relatorios gerenciais',
};

export class AddManagementReportsPermission1792000000000 implements MigrationInterface {
  name = 'AddManagementReportsPermission1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `INSERT INTO ${table('permissions')} (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL`,
      [MANAGEMENT_REPORTS_PERMISSION.code, MANAGEMENT_REPORTS_PERMISSION.name],
    );
    await queryRunner.query(
      `INSERT INTO ${table('profile_permissions')} (organization_id, profile_id, permission_id)
       SELECT profile.organization_id, profile.id, permission.id
         FROM ${table('access_profiles')} profile
         JOIN ${table('organizations')} organization
           ON organization.id = profile.organization_id
         JOIN ${table('permissions')} permission
           ON permission.code = $1
        WHERE organization.kind = 'tenant'
          AND profile.code = 'admin'
       ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`,
      [MANAGEMENT_REPORTS_PERMISSION.code],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `DELETE FROM ${table('profile_permissions')} grant_row
        USING ${table('permissions')} permission
        WHERE permission.id = grant_row.permission_id
          AND permission.code = $1`,
      [MANAGEMENT_REPORTS_PERMISSION.code],
    );
    await queryRunner.query(
      `DELETE FROM ${table('permissions')} WHERE code = $1`,
      [MANAGEMENT_REPORTS_PERMISSION.code],
    );
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
