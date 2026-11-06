import type {
  AlertSeverity,
  AlertSource,
} from '@/modules/Alert/types/alert.types';

const READING_TITLES: Readonly<Record<AlertSeverity, string>> = {
  critical: 'Alerta crítico',
  warning: 'Alerta de atenção',
  info: 'Alerta informativo',
};

const SEVERITY_LABELS: Readonly<Record<AlertSeverity, string>> = {
  critical: 'Crítico',
  warning: 'Atenção',
  info: 'Informativo',
};

const SOURCE_TITLES: Readonly<Record<Exclude<AlertSource, 'reading'>, string>> =
  {
    absence: 'Ausência de registro',
    medication_reminder: 'Lembrete de medicamento',
  };

export interface NotificationMessage {
  title: string;
  body: string;
  subject: string;
  text: string;
  url: string | null;
}

/**
 * Texto do push e do e-mail, que aparecem fora do sistema (tela bloqueada,
 * caixa de e-mail): tipo, severidade e nome do paciente, decisao de Mateus em
 * 2026-11-06. Nunca valor, parametro, regra, formulario ou medicamento.
 */
export const notificationMessage = ({
  source,
  severity,
  patientName,
  appUrl,
}: {
  source: AlertSource;
  severity: AlertSeverity;
  patientName: string;
  appUrl?: string;
}): NotificationMessage => {
  const title =
    source === 'reading' ? READING_TITLES[severity] : SOURCE_TITLES[source];
  const body = `Paciente: ${patientName} · Severidade: ${SEVERITY_LABELS[severity]}`;
  const url = appUrl ?? null;

  return {
    title,
    body,
    subject: `VitaCare: ${title}`,
    text: `${body}\nAcesse o VitaCare para ver os detalhes${url ? `: ${url}` : '.'}`,
    url,
  };
};
