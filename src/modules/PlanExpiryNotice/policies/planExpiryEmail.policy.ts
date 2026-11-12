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
 * Texto do aviso de vencimento (BE-28): organizacao, plano, data de fim, o que
 * o vencimento bloqueia e como pedir a renovacao. Sem dado de paciente.
 */
export const planExpiryEmail = (
  input: PlanExpiryEmailInput,
): { subject: string; text: string } => {
  const expired = input.milestone === 'expired';
  const when = `${formatBrazilDateTime(input.termEndsAt)} (horário de Brasília)`;
  const lines = [
    `O plano ${input.planName} da organização ${input.organizationName} ${expired ? 'venceu' : 'vence'} em ${when}.`,
    '',
    expired
      ? 'Até a renovação, a organização não consegue cadastrar nem reativar usuários e pacientes. A consulta dos dados, os registros de acompanhamento, os alertas e os demais recursos continuam funcionando.'
      : 'No vencimento, a organização deixa de cadastrar e de reativar usuários e pacientes. A consulta dos dados, os registros de acompanhamento, os alertas e os demais recursos continuam funcionando.',
    '',
    'Para renovar, acesse a área de plano do VitaCare e envie uma solicitação de mudança de plano; o administrador da plataforma analisa o pedido.',
    ...(input.appUrl ? [`Acesse: ${input.appUrl}`] : []),
    '',
    'Aviso automático enviado aos administradores da organização. Não responda este e-mail.',
  ];

  return {
    subject: `VitaCare: o plano da organização ${expired ? 'venceu' : remaining(input.termEndsAt, input.now)}`,
    text: lines.join('\n'),
  };
};
