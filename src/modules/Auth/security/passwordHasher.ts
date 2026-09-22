import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Argon2id com os parametros padrao da biblioteca; nada de regra de composicao. */
@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
