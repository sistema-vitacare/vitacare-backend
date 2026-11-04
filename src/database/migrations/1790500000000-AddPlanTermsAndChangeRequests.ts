import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recursos do catalogo do TCC (secao 3.3), congelados em 2026-11-03. Migration
 * nao importa codigo da aplicacao: recurso novo entra em migration nova.
 */
const PLAN_FEATURES = [
  'patient_management',
  'health_records',
  'patient_history',
  'automatic_alerts',
  'responsive_access',
  'extended_registration',
  'management_reports',
  'operational_dashboard',
  'custom_deployment',
];

const BASIC_FEATURES = PLAN_FEATURES.slice(0, 5);

/**
 * Catalogo vigente do BE-07: Basic e Enterprise do TCC, sem preco (os do TCC
 * sao academicos). Pro - Clinica da Figura 46 nao entra.
 */
const CATALOG: ReadonlyArray<{
  code: string;
  name: string;
  description: string;
  userLimit: number;
  patientLimit: number;
  features: string[];
}> = [
  {
    code: 'basic',
    name: 'Basic',
    description:
      'Cadastro de pacientes, registros de saude, historico, alertas automaticos e acesso responsivo.',
    userLimit: 10,
    patientLimit: 200,
    features: BASIC_FEATURES,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description:
      'Recursos do Basic com cadastro ampliado, relatorios gerenciais, painel operacional e implantacao personalizada; expansao de limites contratavel.',
    userLimit: 50,
    patientLimit: 1000,
    features: PLAN_FEATURES,
  },
];

/**
 * BE-07 (RF018/UC04): codigo e recursos no catalogo, vigencia por termos
 * encadeados e solicitacao de mudanca de plano. Planos anteriores viram
 * `legacy-*` e cada organizacao cliente ganha um termo corrente sem fim.
 */
export class AddPlanTermsAndChangeRequests1790500000000 implements MigrationInterface {
  name = 'AddPlanTermsAndChangeRequests1790500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;
    const featureList = PLAN_FEATURES.map((code) => `'${code}'`).join(', ');

    await queryRunner.query(`
      ALTER TABLE ${table('usage_plans')}
        ADD COLUMN code varchar(40),
        ADD COLUMN features text[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(
      `UPDATE ${table('usage_plans')} SET code = 'legacy-' || left(id::text, 8)`,
    );
    await queryRunner.query(`
      ALTER TABLE ${table('usage_plans')}
        ALTER COLUMN code SET NOT NULL,
        ALTER COLUMN code SET DEFAULT ('plan-' || left(gen_random_uuid()::text, 8)),
        ADD CONSTRAINT usage_plans_code_unique UNIQUE (code),
        ADD CONSTRAINT usage_plans_code_format_check CHECK (code ~ '^[a-z0-9][a-z0-9-]*$'),
        ADD CONSTRAINT usage_plans_features_check CHECK (features <@ ARRAY[${featureList}]::text[])
    `);

    for (const plan of CATALOG) {
      await queryRunner.query(
        `INSERT INTO ${table('usage_plans')}
           (code, name, description, user_limit, patient_limit, features)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO NOTHING`,
        [
          plan.code,
          plan.name,
          plan.description,
          plan.userLimit,
          plan.patientLimit,
          plan.features,
        ],
      );
    }

    await queryRunner.query(`
      CREATE TABLE ${table('plan_change_requests')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        current_plan_id uuid NOT NULL,
        requested_plan_id uuid NOT NULL,
        notes text,
        status varchar(16) NOT NULL DEFAULT 'pending',
        requested_by_user_id uuid NOT NULL,
        decided_by_user_id uuid,
        decided_at timestamptz,
        decision_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT plan_change_requests_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT plan_change_requests_current_plan_fk FOREIGN KEY (current_plan_id)
          REFERENCES ${table('usage_plans')} (id) ON DELETE RESTRICT,
        CONSTRAINT plan_change_requests_requested_plan_fk FOREIGN KEY (requested_plan_id)
          REFERENCES ${table('usage_plans')} (id) ON DELETE RESTRICT,
        CONSTRAINT plan_change_requests_requester_tenant_fk FOREIGN KEY (requested_by_user_id, organization_id)
          REFERENCES ${table('users')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT plan_change_requests_decider_fk FOREIGN KEY (decided_by_user_id)
          REFERENCES ${table('users')} (id) ON DELETE RESTRICT,
        CONSTRAINT plan_change_requests_id_org_unique UNIQUE (id, organization_id),
        CONSTRAINT plan_change_requests_status_check CHECK (
          status IN ('pending', 'approved', 'rejected', 'cancelled')
        ),
        CONSTRAINT plan_change_requests_decision_check CHECK (
          (status = 'pending') = (decided_at IS NULL)
          AND (status = 'pending') = (decided_by_user_id IS NULL)
        ),
        CONSTRAINT plan_change_requests_rejection_note_check CHECK (
          status <> 'rejected' OR decision_note IS NOT NULL
        ),
        CONSTRAINT plan_change_requests_notes_length_check CHECK (
          (notes IS NULL OR char_length(notes) <= 500)
          AND (decision_note IS NULL OR char_length(decision_note) <= 500)
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX plan_change_requests_single_pending_unique ON ${table('plan_change_requests')} (organization_id) WHERE status = 'pending' AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX plan_change_requests_org_created_idx ON ${table('plan_change_requests')} (organization_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX plan_change_requests_status_created_idx ON ${table('plan_change_requests')} (status, created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE ${table('organization_plan_terms')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL,
        usage_plan_id uuid NOT NULL,
        starts_at timestamptz NOT NULL DEFAULT now(),
        ends_at timestamptz,
        user_limit integer,
        patient_limit integer,
        origin varchar(24) NOT NULL,
        change_request_id uuid,
        reason text,
        assigned_by_user_id uuid,
        superseded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT organization_plan_terms_organization_fk FOREIGN KEY (organization_id)
          REFERENCES ${table('organizations')} (id) ON DELETE RESTRICT,
        CONSTRAINT organization_plan_terms_usage_plan_fk FOREIGN KEY (usage_plan_id)
          REFERENCES ${table('usage_plans')} (id) ON DELETE RESTRICT,
        CONSTRAINT organization_plan_terms_change_request_tenant_fk FOREIGN KEY (change_request_id, organization_id)
          REFERENCES ${table('plan_change_requests')} (id, organization_id) ON DELETE RESTRICT,
        CONSTRAINT organization_plan_terms_assigned_by_fk FOREIGN KEY (assigned_by_user_id)
          REFERENCES ${table('users')} (id) ON DELETE RESTRICT,
        CONSTRAINT organization_plan_terms_origin_check CHECK (
          origin IN ('initial', 'assignment', 'change_request', 'migration')
        ),
        CONSTRAINT organization_plan_terms_change_request_check CHECK (
          (origin = 'change_request') = (change_request_id IS NOT NULL)
        ),
        CONSTRAINT organization_plan_terms_period_check CHECK (
          ends_at IS NULL OR ends_at > starts_at
        ),
        CONSTRAINT organization_plan_terms_limits_check CHECK (
          (user_limit IS NULL OR user_limit >= 0)
          AND (patient_limit IS NULL OR patient_limit >= 0)
        ),
        CONSTRAINT organization_plan_terms_reason_length_check CHECK (
          reason IS NULL OR char_length(reason) <= 500
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX organization_plan_terms_current_unique ON ${table('organization_plan_terms')} (organization_id) WHERE superseded_at IS NULL AND deleted_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX organization_plan_terms_org_starts_idx ON ${table('organization_plan_terms')} (organization_id, starts_at DESC)`,
    );

    await queryRunner.query(`
      INSERT INTO ${table('organization_plan_terms')}
        (organization_id, usage_plan_id, starts_at, origin)
      SELECT id, usage_plan_id, created_at, 'migration'
        FROM ${table('organizations')}
       WHERE kind = 'tenant'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(`DROP TABLE ${table('organization_plan_terms')}`);
    await queryRunner.query(`DROP TABLE ${table('plan_change_requests')}`);
    // Plano do catalogo ja referenciado por organizacao fica, como legado.
    await queryRunner.query(
      `DELETE FROM ${table('usage_plans')} plan
        WHERE plan.code IN ('basic', 'enterprise')
          AND NOT EXISTS (
            SELECT 1 FROM ${table('organizations')} o WHERE o.usage_plan_id = plan.id
          )`,
    );
    await queryRunner.query(`
      ALTER TABLE ${table('usage_plans')}
        DROP CONSTRAINT usage_plans_features_check,
        DROP CONSTRAINT usage_plans_code_format_check,
        DROP CONSTRAINT usage_plans_code_unique,
        DROP COLUMN features,
        DROP COLUMN code
    `);
  }
}
