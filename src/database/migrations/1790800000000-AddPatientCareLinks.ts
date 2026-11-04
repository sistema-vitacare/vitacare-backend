import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-10 (2026-11-04): vinculos de cuidador e familiar em `user_patients` e
 * `patient_links:manage` para o profissional (decisao de Mateus: admin e
 * profissional gerenciam vinculos). Um vinculo de cuidado vigente por par
 * usuario-paciente; o de responsavel continua com indice proprio.
 */
export class AddPatientCareLinks1790800000000 implements MigrationInterface {
  name = 'AddPatientCareLinks1790800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `ALTER TABLE ${table('user_patients')} DROP CONSTRAINT user_patients_role_check`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('user_patients')} ADD CONSTRAINT user_patients_role_check CHECK (role IN ('responsible_professional', 'caregiver', 'family'))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX user_patients_care_link_unique ON ${table('user_patients')} (patient_id, user_id) WHERE deleted_at IS NULL AND role IN ('caregiver', 'family')`,
    );
    await queryRunner.query(
      `INSERT INTO ${table('profile_permissions')} (organization_id, profile_id, permission_id)
       SELECT profile.organization_id, profile.id, permission.id
         FROM ${table('access_profiles')} profile
         JOIN ${table('organizations')} organization
           ON organization.id = profile.organization_id
          AND organization.kind = 'tenant'
         JOIN ${table('permissions')} permission
           ON permission.code = 'patient_links:manage'
        WHERE profile.code = 'professional'
       ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(
      `UPDATE ${table('profile_permissions')} grant_row
          SET deleted_at = now()
         FROM ${table('access_profiles')} profile,
              ${table('permissions')} permission
        WHERE profile.id = grant_row.profile_id
          AND permission.id = grant_row.permission_id
          AND profile.code = 'professional'
          AND permission.code = 'patient_links:manage'
          AND grant_row.deleted_at IS NULL`,
    );
    await queryRunner.query(
      `DELETE FROM ${table('user_patients')} WHERE role IN ('caregiver', 'family')`,
    );
    await queryRunner.query(
      `DROP INDEX ${this.schema(queryRunner)}."user_patients_care_link_unique"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('user_patients')} DROP CONSTRAINT user_patients_role_check`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('user_patients')} ADD CONSTRAINT user_patients_role_check CHECK (role IN ('responsible_professional'))`,
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
