import { renderEmail } from '@/common/mail/emailLayout';
import type { EmailMessage } from '@/modules/Notification/channels/emailSender';
import { formatBrazilDateTime } from '@/modules/Plan/policies/planExpiry.policy';

export interface InvitationEmailInput {
  to: string;
  userName: string;
  organizationName: string;
  organizationCode: string;
  inviterName: string;
  profileName: string;
  acceptUrl: string;
  expiresAt: Date;
}

/**
 * Convite por e-mail (BE-31): quem convidou, para qual organizacao e perfil,
 * o link no botao "Criar minha senha" e a validade em Brasilia. O codigo da
 * organizacao vai no texto (decisao de Mateus, 2026-11-13) porque o login o
 * pede sempre. Sem CPF, telefone, id interno nem dado clinico.
 */
export const invitationEmail = (input: InvitationEmailInput): EmailMessage => {
  const invited = `${input.inviterName} convidou você para acessar o VitaCare na organização ${input.organizationName}, com o perfil ${input.profileName}.`;

  return {
    to: input.to,
    ...renderEmail({
      subject: 'Convite para acessar o VitaCare',
      preheader: invited,
      title: 'Convite para acessar o VitaCare',
      greeting: `Olá, ${input.userName}.`,
      paragraphs: [
        invited,
        'Para aceitar, abra o link abaixo e cadastre a sua senha.',
      ],
      action: { label: 'Criar minha senha', url: input.acceptUrl },
      closing: [
        `O link vale até ${formatBrazilDateTime(input.expiresAt)} (horário de Brasília) e só pode ser usado uma vez. Depois disso, peça um novo convite ao administrador da organização.`,
        `Para entrar no VitaCare, use o código da organização "${input.organizationCode}", este e-mail e a senha que você cadastrar.`,
        'Se você não esperava este convite, ignore este e-mail.',
      ],
      organizationName: input.organizationName,
    }),
  };
};
