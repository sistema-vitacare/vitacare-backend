export const PASSWORD_RECOVERY_MAILER = Symbol('PASSWORD_RECOVERY_MAILER');
export interface PasswordRecoveryMailer {
  readonly enabled: boolean;
  send(input: {
    to: string;
    resetUrl: string;
    expiresInMinutes: number;
  }): Promise<void>;
}
