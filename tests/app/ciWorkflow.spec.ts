import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Job {
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  steps: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }>;
}

// Transitiva do @eslint/eslintrc, sem tipos: so para ler o YAML do workflow.
const { load } = jest.requireActual<{ load: (text: string) => unknown }>(
  'js-yaml',
);

const workflow = load(
  readFileSync(join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8'),
) as { jobs: Record<string, Job> };

const MAIN_PUSH_ONLY =
  "github.ref == 'refs/heads/main' && github.event_name != 'pull_request'";

/**
 * O job que roda o codigo de PR (Dockerfile, scripts, smoke) nao pode ter
 * escrita no GHCR: a `:latest` e o que a stack de producao puxa (BE-25).
 */
describe('workflow de CI e deploy', () => {
  const { jobs } = workflow;

  it('a homologacao so le pacotes e nao guarda o token no checkout', () => {
    expect(jobs.homologacao.permissions?.packages).toBe('read');
    const checkout = jobs.homologacao.steps.find((step) =>
      step.uses?.startsWith('actions/checkout'),
    );
    expect(checkout?.with?.['persist-credentials']).toBe(false);
  });

  it('so o job de publicacao escreve no GHCR, e so no push da main', () => {
    const writers = Object.entries(jobs)
      .filter(([, job]) => job.permissions?.packages === 'write')
      .map(([name]) => name);

    expect(writers).toEqual(['publicacao']);
    expect(jobs.publicacao.needs).toBe('homologacao');
    expect(jobs.publicacao.if).toBe(MAIN_PUSH_ONLY);
  });

  it('o deploy espera a publicacao da imagem homologada', () => {
    expect(jobs.deploy.needs).toBe('publicacao');
    expect(jobs.deploy.if).toBe(MAIN_PUSH_ONLY);
  });
});
