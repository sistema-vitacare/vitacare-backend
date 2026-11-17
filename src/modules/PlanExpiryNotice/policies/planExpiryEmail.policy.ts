import { type RenderedEmail, renderEmail } from '@/common/mail/emailLayout';
import { todayInBrazil } from '@/modules/Medication/policies/medicationSchedule.policy';
import { formatBrazilDateTime } from '@/modules/Plan/policies/planExpiry.policy';
import type { PlanExpiryMilestone } from '@/modules/Plan/types/plan.types';

export interface PlanExpiryEmailInput {
  milestone: PlanExpiryMilestone;
  termEndsAt: Date;
  organizationName: string;
  planName: string;
  /** Instante do envio: o prazo no assunto e contado dele, em dias locais. */
  now: Date;
  appUrl?: string;
}

const DAY_MS = 86_400_000;

const localDay = (instant: Date): number =>
  Date.parse(`${todayInBrazil(instant)}T00:00:00.000Z`) / DAY_MS;

const remaining = (termEndsAt: Date, now: Date): string => {
  const days = localDay(termEndsAt) - localDay(now);

  if (days <= 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';

  return `vence em ${days} dias`;
};

/**
 * Aviso de vencimento (BE-28): organizacao, plano, data de fim, o que o
 * vencimento bloqueia e como pedir a renovacao. Sem dado de paciente. A data
 * vai no bloco de destaque (atencao antes do fim, critico depois) e o link do
 * app no botao; o frontend ainda nao tem tela de plano, entao o botao abre o
 * app (`NOTIFICATION_APP_URL`).
 */
export const planExpiryEmail = (input: PlanExpiryEmailInput): RenderedEmail => {
  const expired = input.milestone === 'expired';
  const when = `${formatBrazilDateTime(input.termEndsAt)} (horário de Brasília)`;
  const status = expired ? 'venceu' : remaining(input.termEndsAt, input.now);
  const summary = `O plano ${input.planName} da organização ${input.organizationName} ${expired ? 'venceu' : 'vence'} em ${when}.`;

  return renderEmail({
    subject: `VitaCare: o plano da organização ${status}`,
    preheader: summary,
    title: `O plano da organização ${status}`,
    highlight: {
      tone: expired ? 'critical' : 'warning',
      label: expired ? 'Venceu em' : 'Vence em',
      value: when,
      detail: `Plano ${input.planName}`,
    },
    paragraphs: [
      summary,
      expired
        ? 'Até a renovação, a organização não consegue cadastrar nem reativar usuários e pacientes. A consulta dos dados, os registros de acompanhamento, os alertas e os demais recursos continuam funcionando.'
        : 'No vencimento, a organização deixa de cadastrar e de reativar usuários e pacientes. A consulta dos dados, os registros de acompanhamento, os alertas e os demais recursos continuam funcionando.',
      'Para renovar, acesse a área de plano do VitaCare e envie uma solicitação de mudança de plano; o administrador da plataforma analisa o pedido.',
    ],
    ...(input.appUrl
      ? { action: { label: 'Acessar o VitaCare', url: input.appUrl } }
      : {}),
    footerNote:
      'Aviso automático enviado aos administradores da organização. Não responda este e-mail.',
    organizationName: input.organizationName,
  });
};
