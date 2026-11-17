import { type RenderedEmail, renderEmail } from '@/common/mail/emailLayout';
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
  url: string | null;
  email: RenderedEmail;
}

/**
 * Texto do push e do e-mail, que aparecem fora do sistema (tela bloqueada,
 * caixa de e-mail): tipo, severidade e nome do paciente, decisao de Mateus em
 * 2026-11-06. Nunca valor, parametro, regra, formulario ou medicamento. No
 * e-mail, a severidade vai no bloco de destaque e o link no botao.
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
    url,
    email: renderEmail({
      subject: `VitaCare: ${title}`,
      preheader: body,
      title,
      highlight: {
        tone: severity,
        label: 'Severidade',
        value: SEVERITY_LABELS[severity],
        detail: `Paciente: ${patientName}`,
      },
      paragraphs: ['Acesse o VitaCare para ver os detalhes.'],
      ...(url ? { action: { label: 'Abrir no VitaCare', url } } : {}),
    }),
  };
};
