import { registerAs } from '@nestjs/config';

export default registerAs('operations', () => ({
  /** Monitor Push do Uptime Kuma; contem token, nunca vai para log. */
  uptimeKumaPushUrl: process.env.UPTIME_KUMA_PUSH_URL || undefined,
}));
