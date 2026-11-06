import { registerAs } from '@nestjs/config';

/** Push do navegador (VAPID) e link do app nas mensagens fora do sistema. */
export default registerAs('notification', () => ({
  pushEnabled: process.env.WEB_PUSH_ENABLED === 'true',
  pushPublicKey: process.env.WEB_PUSH_PUBLIC_KEY || undefined,
  pushPrivateKey: process.env.WEB_PUSH_PRIVATE_KEY || undefined,
  pushSubject: process.env.WEB_PUSH_SUBJECT || undefined,
  appUrl: process.env.NOTIFICATION_APP_URL || undefined,
}));
