import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  enabled: process.env.SMTP_ENABLED === 'true',
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || undefined,
  password: process.env.SMTP_PASSWORD || undefined,
  from: process.env.SMTP_FROM,
  passwordResetUrl: process.env.PASSWORD_RESET_URL,
  connectionTimeoutMs: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 10000),
  greetingTimeoutMs: Number(process.env.SMTP_GREETING_TIMEOUT_MS ?? 10000),
  socketTimeoutMs: Number(process.env.SMTP_SOCKET_TIMEOUT_MS ?? 10000),
}));
