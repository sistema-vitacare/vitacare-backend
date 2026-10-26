export const PASSWORD_RECOVERY_MAILER = Symbol('PASSWORD_RECOVERY_MAILER');

export interface PasswordRecoveryMessage {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}

/**
 * Porta de envio do link de recuperacao. `enabled` existe para o caso de uso
 * decidir antes de criar token: sem entrega possivel nao se emite credencial.
 */
export interface PasswordRecoveryMailer {
  readonly enabled: boolean;

  send(message: PasswordRecoveryMessage): Promise<void>;
}
