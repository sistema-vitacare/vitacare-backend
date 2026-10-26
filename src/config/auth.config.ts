import { registerAs } from '@nestjs/config';

/**
 * Prazos e limites de autenticacao decididos em 2026-09-21. Ficam aqui para
 * que use case, guard e limitador leiam o mesmo valor e para que um ajuste
 * futuro seja uma mudanca unica, registrada no vault.
 */
export default registerAs('auth', () => ({
  /** Sessao normal: 30 minutos sem atividade. */
  sessionIdleSeconds: 1800,
  /** Sessao normal: 12 horas absolutas. */
  sessionAbsoluteSeconds: 43200,
  /** Sessao restrita de primeiro acesso: 10 minutos. */
  firstAccessSeconds: 600,
  /** Token de recuperacao por link: 15 minutos. */
  recoverySeconds: 900,
  /** Janela e bloqueio de login: 5 falhas em 15 minutos, bloqueio de 15. */
  loginWindowSeconds: 900,
  loginBlockSeconds: 900,
  loginMaxFailures: 5,
  /** Recuperacao: 3 por conta e 10 por IP em uma hora. */
  recoveryWindowSeconds: 3600,
  recoveryMaxPerAccount: 3,
  recoveryMaxPerIp: 10,
}));
