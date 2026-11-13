import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BE-31 (decidido por Mateus em 2026-11-12/13): convite por e-mail com link de
 * uso unico para o proprio usuario cadastrar a senha. `user_invitations` guarda
 * so o SHA-256 do token, quem convidou, quando o SMTP aceitou o envio e por que
 * o convite morreu; ha no maximo um convite vivo por usuario. As linhas mortas
 * ficam como historico (retencao definitiva na pendencia LGPD, P31).
 *
 * `users_pending_check` passa a admitir os dois modos de convite: senha
 * provisoria (hash, troca obrigatoria e prazo) ou link (sem hash, sem troca
 * obrigatoria e sem prazo). O `down` recusa a reversao enquanto houver
 * pendente por link, em vez de apagar dados. Migration nao importa codigo da
 * aplicacao.
 */
export class CreateUserInvitations1792100000000 implements MigrationInterface {
  name = 'CreateUserInvitations1792100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    await queryRunner.query(`
      CREATE TABLE ${table('user_invitations')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        user_id uuid NOT NULL,
        invited_by_user_id uuid NOT NULL,
        token_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        sent_at timestamptz,
        consumed_at timestamptz,
        revoked_at timestamptz,
        revoked_reason varchar(40),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT user_invitations_token_hash_unique UNIQUE (token_hash),
        CONSTRAINT user_invitations_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT user_invitations_user_tenant_fk FOREIGN KEY (user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT user_invitations_inviter_tenant_fk FOREIGN KEY (invited_by_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT user_invitations_outcome_check CHECK (consumed_at IS NULL OR revoked_at IS NULL),
        CONSTRAINT user_invitations_revoked_check CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
        CONSTRAINT user_invitations_revoked_reason_check CHECK (revoked_reason IN ('send_failed', 'reissued', 'email_changed', 'user_deactivated', 'organization_deactivated', 'channel_changed'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX user_invitations_live_unique ON ${table('user_invitations')} (organization_id, user_id) WHERE consumed_at IS NULL AND revoked_at IS NULL AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX user_invitations_live_expires_idx ON ${table('user_invitations')} (expires_at) WHERE consumed_at IS NULL AND revoked_at IS NULL AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX user_invitations_user_latest_idx ON ${table('user_invitations')} (user_id, created_at DESC)`,
    );

    await queryRunner.query(
      `ALTER TABLE ${table('users')} DROP CONSTRAINT users_pending_check`,
    );
    await queryRunner.query(`
      ALTER TABLE ${table('users')} ADD CONSTRAINT users_pending_check CHECK (
        status <> 'pending'
        OR (must_change_password AND password_hash IS NOT NULL
            AND temporary_password_expires_at IS NOT NULL)
        OR (NOT must_change_password AND password_hash IS NULL
            AND temporary_password_expires_at IS NULL)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = this.tableName(queryRunner);

    const [{ count }] = (await queryRunner.query(
      `SELECT count(*)::int AS count FROM ${table('users')}
        WHERE status = 'pending' AND password_hash IS NULL`,
    )) as Array<{ count: number }>;

    if (count > 0) {
      throw new Error(
        `Reversao recusada: ${count} usuario(s) pendente(s) aguardam convite por link, sem senha. ` +
          'Reemita o convite com senha provisoria ou inative esses usuarios antes de reverter.',
      );
    }

    await queryRunner.query(
      `ALTER TABLE ${table('users')} DROP CONSTRAINT users_pending_check`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table('users')} ADD CONSTRAINT users_pending_check CHECK (status <> 'pending' OR (must_change_password AND temporary_password_expires_at IS NOT NULL))`,
    );
    await queryRunner.query(`DROP TABLE ${table('user_invitations')}`);
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
