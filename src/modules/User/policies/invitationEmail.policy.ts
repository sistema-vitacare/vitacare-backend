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
 * Texto do convite por e-mail (BE-31): quem convidou, para qual organizacao e
 * perfil, o link e a validade em Brasilia. O codigo da organizacao vai no
 * texto (decisao de Mateus, 2026-11-13) porque o login o pede sempre. Sem
 * CPF, telefone, id interno nem dado clinico.
 */
export const invitationEmail = (input: InvitationEmailInput): EmailMessage => ({
  to: input.to,
  subject: 'Convite para acessar o VitaCare',
  text: [
    `Olá, ${input.userName}.`,
    '',
    `${input.inviterName} convidou você para acessar o VitaCare na organização ${input.organizationName}, com o perfil ${input.profileName}.`,
    '',
    'Para aceitar, abra o link abaixo e cadastre a sua senha:',
    input.acceptUrl,
    '',
    `O link vale até ${formatBrazilDateTime(input.expiresAt)} (horário de Brasília) e só pode ser usado uma vez. Depois disso, peça um novo convite ao administrador da organização.`,
    '',
    `Para entrar no VitaCare, use o código da organização "${input.organizationCode}", este e-mail e a senha que você cadastrar.`,
    '',
    'Se você não esperava este convite, ignore este e-mail.',
  ].join('\n'),
});
