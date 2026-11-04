import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Regras do Quadro 2 do TCC (secao 3.3), decididas por Mateus em 2026-11-04:
 * descricao, mensalidade de referencia e expansao de limites so no Enterprise.
 * Migration nao importa codigo da aplicacao: texto e valores ficam aqui.
 */
const CATALOG: ReadonlyArray<{
  code: string;
  description: string;
  monthlyPrice: string;
  expandable: boolean;
}> = [
  {
    code: 'basic',
    description:
      'Indicado para clínicas, consultórios e operações de pequeno porte que desejam organizar o acompanhamento de pacientes em uma estrutura inicial de uso.',
    monthlyPrice: '499.00',
    expandable: false,
  },
  {
    code: 'enterprise',
    description:
      'Indicado para clínicas maiores, empresas de home care e instituições com maior volume de profissionais, pacientes e necessidade de controle operacional.',
    monthlyPrice: '1990.00',
    expandable: true,
  },
];

/** Textos da migration `1790500000000`, restaurados no `down`. */
const PREVIOUS_DESCRIPTIONS: Readonly<Record<string, string>> = {
  basic:
    'Cadastro de pacientes, registros de saude, historico, alertas automaticos e acesso responsivo.',
  enterprise:
    'Recursos do Basic com cadastro ampliado, relatorios gerenciais, painel operacional e implantacao personalizada; expansao de limites contratavel.',
};

/**
 * BE-07 (RF018/UC04), Quadro 2: `usage_plans.expandable`, preco e descricao do
 * Basic e do Enterprise, e catalogo restrito a eles. Planos `legacy-*` saem do
 * catalogo (status falso), mas seguem valendo para quem ja os usa.
 */
export class ApplyPlanCatalogRules1790600000000 implements MigrationInterface {
  name = 'ApplyPlanCatalogRules1790600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    await queryRunner.query(
      `ALTER TABLE ${table('usage_plans')} ADD COLUMN expandable boolean NOT NULL DEFAULT false`,
    );

    for (const plan of CATALOG) {
      await queryRunner.query(
        `UPDATE ${table('usage_plans')}
            SET description = $2, monthly_price = $3, expandable = $4, updated_at = now()
          WHERE code = $1`,
        [plan.code, plan.description, plan.monthlyPrice, plan.expandable],
      );
    }

    await queryRunner.query(
      `UPDATE ${table('usage_plans')}
          SET status = false, updated_at = now()
        WHERE code LIKE 'legacy-%' AND status`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const options = queryRunner.connection.options;
    if (options.type !== 'postgres')
      throw new Error('Esta migration exige PostgreSQL.');
    const schema = `"${String(options.schema ?? 'public').replace(/"/g, '""')}"`;
    const table = (name: string) => `${schema}."${name}"`;

    // Antes desta migration nenhum plano legado era retirado do catalogo.
    await queryRunner.query(
      `UPDATE ${table('usage_plans')}
          SET status = true, updated_at = now()
        WHERE code LIKE 'legacy-%' AND NOT status`,
    );

    for (const [code, description] of Object.entries(PREVIOUS_DESCRIPTIONS)) {
      await queryRunner.query(
        `UPDATE ${table('usage_plans')}
            SET description = $2, monthly_price = NULL, updated_at = now()
          WHERE code = $1`,
        [code, description],
      );
    }

    await queryRunner.query(
      `ALTER TABLE ${table('usage_plans')} DROP COLUMN expandable`,
    );
  }
}
