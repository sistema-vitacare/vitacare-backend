import { TENANT_PROFILES } from '@/modules/Access/access.permissions';

/** Info, normal, atencao e critico da Figura 45. */
export const AUDIT_SEVERITIES = [
  'info',
  'normal',
  'warning',
  'critical',
] as const;

export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export interface AuditActionEntry {
  label: string;
  /** `null`: a gravidade vem do proprio evento (`alert.generated`). */
  severity: AuditSeverity | null;
}

const entry = (
  label: string,
  severity: AuditSeverity | null = 'normal',
): AuditActionEntry => ({ label, severity });

/**
 * Catalogo fixo de acoes (decisao de Mateus, 2026-11-09): rotulo e gravidade
 * por acao. A ordem e a de exibicao no seletor "Acao" da tela.
 */
export const AUDIT_ACTIONS: Readonly<Record<string, AuditActionEntry>> = {
  'auth.login_succeeded': entry('Entrou no sistema'),
  'auth.login_failed': entry('Tentativa de acesso recusada', 'warning'),
  'auth.first_access_started': entry('Iniciou o primeiro acesso'),
  'auth.first_access_completed': entry('Concluiu o primeiro acesso'),
  'auth.logout': entry('Saiu do sistema'),
  'auth.password_changed': entry('Trocou a própria senha'),
  'auth.password_recovered': entry('Redefiniu a senha pela recuperação'),
  'auth.admin_password_reset': entry('Emitiu senha temporária', 'warning'),
  'auth.bootstrap_completed': entry('Concluiu a configuração inicial'),
  'organization.platform_seeded': entry('Criou a plataforma', 'info'),
  'organization.created': entry('Cadastrou organização'),
  'organization.updated': entry('Editou organização'),
  'organization.deactivated': entry('Inativou organização', 'warning'),
  'organization.reactivated': entry('Reativou organização'),
  'plan.assigned': entry('Atribuiu plano', 'warning'),
  'plan_expiry_notice.generated': entry(
    'Gerou aviso de vencimento do plano',
    'warning',
  ),
  'plan_change_request.created': entry('Solicitou mudança de plano'),
  'plan_change_request.cancelled': entry('Cancelou solicitação de plano'),
  'plan_change_request.approved': entry(
    'Aprovou solicitação de plano',
    'warning',
  ),
  'plan_change_request.rejected': entry(
    'Recusou solicitação de plano',
    'warning',
  ),
  'user.created': entry('Cadastrou usuário'),
  'user.updated': entry('Editou usuário'),
  'user.profile_changed': entry('Alterou perfil de usuário', 'warning'),
  'user.invitation_reissued': entry('Reemitiu convite de usuário'),
  'user.deactivated': entry('Inativou usuário', 'warning'),
  'user.reactivated': entry('Reativou usuário'),
  'profile.updated': entry('Editou o próprio cadastro', 'info'),
  'profile.email_changed': entry('Trocou o próprio e-mail', 'warning'),
  'patient.created': entry('Cadastrou paciente'),
  'patient.updated': entry('Editou paciente'),
  'patient.responsible_changed': entry('Trocou o profissional responsável'),
  'patient.deactivated': entry('Inativou paciente', 'warning'),
  'patient.reactivated': entry('Reativou paciente'),
  'patient_link.created': entry('Vinculou usuário ao paciente'),
  'patient_link.updated': entry('Editou vínculo com paciente'),
  'patient_link.revoked': entry('Revogou vínculo com paciente', 'warning'),
  'form.created': entry('Criou formulário'),
  'form.updated': entry('Editou formulário'),
  'form.draft_saved': entry('Salvou rascunho de formulário'),
  'form.draft_discarded': entry('Descartou rascunho de formulário'),
  'form.published': entry('Publicou formulário'),
  'form.deactivated': entry('Inativou formulário', 'warning'),
  'form.reactivated': entry('Reativou formulário'),
  'follow_up.created': entry('Registrou acompanhamento'),
  'follow_up.annulled': entry('Anulou registro de acompanhamento', 'warning'),
  'follow_up_attachment.created': entry('Anexou arquivo ao registro'),
  'follow_up_attachment.removed': entry('Removeu anexo do registro', 'warning'),
  'medication.created': entry('Cadastrou medicamento'),
  'medication.updated': entry('Editou medicamento'),
  'medication.deactivated': entry('Inativou medicamento', 'warning'),
  'medication.reactivated': entry('Reativou medicamento'),
  'alert_rule.created': entry('Criou regra de alerta'),
  'alert_rule.updated': entry('Editou regra de alerta'),
  'alert_rule.deactivated': entry('Inativou regra de alerta', 'warning'),
  'alert_rule.reactivated': entry('Reativou regra de alerta'),
  'alert.generated': entry('Gerou alerta', null),
  'alert.resolved': entry('Resolveu alerta'),
  'notification_preferences.updated': entry(
    'Alterou preferências de notificação',
    'info',
  ),
  'push_subscription.created': entry(
    'Ativou notificações no navegador',
    'info',
  ),
  'push_subscription.revoked': entry(
    'Desativou notificações no navegador',
    'info',
  ),
  'patient_report.exported': entry('Exportou relatório do paciente', 'warning'),
  'management_report.exported': entry(
    'Exportou relatório gerencial',
    'warning',
  ),
  'audit_events.exported': entry('Exportou a auditoria', 'warning'),
};

/** Acao fora do catalogo (evento antigo) aparece pelo proprio codigo. */
export const auditActionLabel = (action: string): string =>
  AUDIT_ACTIONS[action]?.label ?? action;

const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Codigos cujo codigo ou rotulo contem o termo, sem acento e sem caixa. */
export const actionsMatching = (search: string): string[] => {
  const term = fold(search.trim());

  return Object.entries(AUDIT_ACTIONS)
    .filter(
      ([action, { label }]) =>
        fold(action).includes(term) || fold(label).includes(term),
    )
    .map(([action]) => action);
};

const sqlList = (values: string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * Gravidade calculada na consulta, a partir do catalogo: serve ao filtro e a
 * projecao. `alert.generated` usa a severidade gravada no evento.
 */
export const auditSeveritySql = (
  actionColumn: string,
  afterColumn: string,
): string => {
  const fixed = (severity: AuditSeverity) =>
    Object.entries(AUDIT_ACTIONS)
      .filter(([, entry]) => entry.severity === severity)
      .map(([action]) => action);
  const branches = (['warning', 'info', 'critical'] as const)
    .filter((severity) => fixed(severity).length > 0)
    .map(
      (severity) =>
        `WHEN ${actionColumn} IN (${sqlList(fixed(severity))}) THEN '${severity}'`,
    );

  return `CASE
    WHEN ${actionColumn} = 'alert.generated' THEN
      CASE WHEN ${afterColumn}->>'severity' IN ('critical', 'warning', 'info')
           THEN ${afterColumn}->>'severity' ELSE 'normal' END
    ${branches.join('\n    ')}
    ELSE 'normal'
  END`;
};

export const AUDIT_PROFILE_NAMES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(TENANT_PROFILES).map(([code, profile]) => [
      code,
      profile.name,
    ]),
  ),
  platform_admin: 'Administrador master',
};
