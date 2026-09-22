import { Injectable } from '@nestjs/common';

import type { PasswordRecoveryMailer } from './passwordRecoveryMailer';

/** SMTP desligado: a API sobe normalmente e a recuperacao nao emite token. */
@Injectable()
export class DisabledPasswordRecoveryMailer implements PasswordRecoveryMailer {
  readonly enabled = false;

  send(): Promise<void> {
    return Promise.resolve();
  }
}
