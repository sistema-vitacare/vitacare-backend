import { Injectable } from '@nestjs/common';
import type { PasswordRecoveryMailer } from './passwordRecoveryMailer';

@Injectable()
export class DisabledPasswordRecoveryMailer implements PasswordRecoveryMailer {
  readonly enabled = false;
  send(): Promise<void> {
    return Promise.resolve();
  }
}
