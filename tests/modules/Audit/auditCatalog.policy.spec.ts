import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUDIT_ACTIONS,
  AUDIT_PROFILE_NAMES,
  actionsMatching,
  auditActionLabel,
  auditSeveritySql,
} from '@/modules/Audit/policies/auditCatalog.policy';

const SRC = join(__dirname, '..', '..', '..', 'src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });

/** Acoes montadas por template: prefixo -> sufixos possiveis no codigo. */
const DYNAMIC_ACTIONS: Record<string, string[]> = {
  push_subscription: ['created', 'revoked'],
};

/** Chamada de query builder: os literais sao colunas, nao acoes. */
const QUERY_BUILDER =
  /\.(addOrderBy|orderBy|addSelect|select|where|andWhere|groupBy)\(/;

/** Dominios das acoes gravadas; literais de outros prefixos nao sao acoes. */
const AUDIT_DOMAINS = new Set(
  Object.keys(AUDIT_ACTIONS).map((action) => action.split('.')[0]),
);

/** Literais `dominio.acao` em todo o `src`, fora de query builder. */
const actionsWrittenInSource = (): string[] => {
  const actions = new Set<string>();

  for (const file of sourceFiles(SRC)) {
    if (file.includes(join('Audit', 'policies'))) continue;

    let insideQueryBuilder = false;

    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const skip = insideQueryBuilder || QUERY_BUILDER.test(line);

      // Argumentos de `.addSelect(` quebrados em varias linhas, ate o `)`.
      insideQueryBuilder =
        (insideQueryBuilder ||
          (QUERY_BUILDER.test(line) && line.trimEnd().endsWith('('))) &&
        !/^\s*\)/.test(line);

      if (skip) continue;

      for (const [, action, domain] of line.matchAll(
        /'(([a-z_]+)\.[a-z_]+)'/g,
      )) {
        if (AUDIT_DOMAINS.has(domain)) actions.add(action);
      }

      for (const [, prefix] of line.matchAll(/`([a-z_]+)\.\$\{/g)) {
        if (!AUDIT_DOMAINS.has(prefix)) continue;
        expect(DYNAMIC_ACTIONS[prefix]).toBeDefined();
        DYNAMIC_ACTIONS[prefix].forEach((suffix) =>
          actions.add(`${prefix}.${suffix}`),
        );
      }
    }
  }

  return [...actions].sort();
};

describe('catalogo de acoes da auditoria (BE-23)', () => {
  it('cobre toda acao gravada pelo codigo', () => {
    const written = actionsWrittenInSource();

    expect(written.length).toBeGreaterThan(50);
    expect(written.filter((action) => !(action in AUDIT_ACTIONS))).toEqual([]);
  });

  it('inclui a exportacao da auditoria e a acao legada do bootstrap', () => {
    expect(AUDIT_ACTIONS['audit_events.exported'].severity).toBe('warning');
    expect(AUDIT_ACTIONS['auth.bootstrap_completed']).toBeDefined();
  });

  it('inclui o aceite do termo de uso como acao normal (BE-32)', () => {
    expect(AUDIT_ACTIONS['terms.accepted']).toEqual({
      label: 'Aceitou o termo de uso',
      severity: 'normal',
    });
  });

  it('rotula em portugues e devolve o codigo para acao desconhecida', () => {
    expect(auditActionLabel('follow_up.created')).toBe(
      'Registrou acompanhamento',
    );
    expect(auditActionLabel('legado.qualquer')).toBe('legado.qualquer');
  });

  it('so alert.generated tem gravidade variavel', () => {
    const variable = Object.entries(AUDIT_ACTIONS)
      .filter(([, entry]) => entry.severity === null)
      .map(([action]) => action);

    expect(variable).toEqual(['alert.generated']);
  });

  it.each([
    'auth.login_failed',
    'auth.admin_password_reset',
    'user.deactivated',
    'user.profile_changed',
    'organization.deactivated',
    'patient.deactivated',
    'patient_link.revoked',
    'follow_up.annulled',
    'follow_up_attachment.removed',
    'form.deactivated',
    'medication.deactivated',
    'alert_rule.deactivated',
    'plan.assigned',
    'plan_change_request.approved',
    'plan_change_request.rejected',
    'patient_report.exported',
    'audit_events.exported',
  ])('%s e atencao (warning)', (action) => {
    expect(AUDIT_ACTIONS[action].severity).toBe('warning');
  });

  it.each([
    'organization.platform_seeded',
    'push_subscription.created',
    'push_subscription.revoked',
    'notification_preferences.updated',
  ])('%s e info', (action) => {
    expect(AUDIT_ACTIONS[action].severity).toBe('info');
  });

  it('o resto e normal e nada e critico fixo', () => {
    expect(AUDIT_ACTIONS['follow_up.created'].severity).toBe('normal');
    expect(
      Object.values(AUDIT_ACTIONS).some(
        (entry) => entry.severity === 'critical',
      ),
    ).toBe(false);
  });

  it('busca por codigo ou rotulo sem acento e sem caixa', () => {
    expect(actionsMatching('inativ')).toEqual(
      expect.arrayContaining(['user.deactivated', 'patient.deactivated']),
    );
    expect(actionsMatching('LOGIN')).toEqual(
      expect.arrayContaining(['auth.login_failed', 'auth.login_succeeded']),
    );
    expect(actionsMatching('exportou')).toEqual(
      expect.arrayContaining([
        'patient_report.exported',
        'audit_events.exported',
      ]),
    );
    expect(actionsMatching('nada-disso')).toEqual([]);
  });

  it('o CASE SQL usa a severidade gravada so em alert.generated', () => {
    const sql = auditSeveritySql('e.action', 'e.after_values');

    expect(sql).toContain("WHEN e.action = 'alert.generated'");
    expect(sql).toContain("e.after_values->>'severity'");
    expect(sql).toContain("'audit_events.exported'");
    expect(sql).toContain("ELSE 'normal'");
  });

  it('nomeia o perfil do master e os quatro de tenant', () => {
    expect(AUDIT_PROFILE_NAMES).toEqual({
      admin: 'Administrador',
      professional: 'Profissional de saude',
      caregiver: 'Cuidador',
      family: 'Familiar',
      platform_admin: 'Administrador master',
    });
  });
});
