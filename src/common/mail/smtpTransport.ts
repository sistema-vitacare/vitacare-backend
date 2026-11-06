import type { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transporte SMTP do projeto (recuperacao de senha e notificacoes). Sem acesso
 * a arquivo ou URL no corpo e sem log, que levaria destinatario e texto.
 */
export const createSmtpTransport = (config: ConfigService): Transporter => {
  const user = config.get<string>('mail.user');
  const password = config.get<string>('mail.password');

  return nodemailer.createTransport({
    host: config.getOrThrow<string>('mail.host'),
    port: config.getOrThrow<number>('mail.port'),
    secure: config.getOrThrow<boolean>('mail.secure'),
    ...(user && password ? { auth: { user, pass: password } } : {}),
    connectionTimeout: config.getOrThrow<number>('mail.connectionTimeoutMs'),
    greetingTimeout: config.getOrThrow<number>('mail.greetingTimeoutMs'),
    socketTimeout: config.getOrThrow<number>('mail.socketTimeoutMs'),
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
};
