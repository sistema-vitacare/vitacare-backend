import type { Provider } from '@nestjs/common';

import { UserInvitationRepository } from '@/modules/Auth/repositories/userInvitation.repository';
import { DisabledChannelSender } from '@/modules/Notification/channels/disabledChannel.sender';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '@/modules/Notification/channels/emailSender';
import { USER_INVITATION_PROVIDERS } from '@/modules/User/user.module';

/**
 * Providers do convite (BE-31) para os e2e que montam o modulo User a mao.
 * Sem porta informada, o SMTP fica desligado: o convite e a senha provisoria
 * de sempre.
 */
export const userInvitationTestProviders = (
  sender: EmailSender = new DisabledChannelSender(),
): Provider[] => [
  ...USER_INVITATION_PROVIDERS,
  UserInvitationRepository,
  { provide: EMAIL_SENDER, useValue: sender },
];
