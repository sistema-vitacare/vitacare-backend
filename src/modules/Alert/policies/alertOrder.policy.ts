import type { AlertSort } from '../types/alert.types';

/** Mais grave primeiro (alias `a`): critical, warning, info. */
export const ALERT_SEVERITY_RANK = `CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`;

/**
 * `ORDER BY` da lista de alertas (BE-33). `priority` e a ordem da Figura 42 e
 * dos alertas prioritarios do painel; `id` desempata para a paginacao ser
 * estavel.
 */
export const alertListOrder = (sort: AlertSort): string =>
  sort === 'priority'
    ? `${ALERT_SEVERITY_RANK}, a.generated_at DESC, a.id`
    : 'a.generated_at DESC, a.id';
