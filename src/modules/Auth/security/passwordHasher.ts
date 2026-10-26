import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/** Argon2id com os parametros padrao da biblioteca; nada de regra de composicao. */
@Injectable()
export class PasswordHasher {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  /**
   * Verificacao contra um hash descartavel, usada quando nao existe hash real
   * para conferir. Sem isto, "conta inexistente" responderia visivelmente mais
   * rapido que "senha errada" e o tempo de resposta viraria um oraculo de quem
   * tem conta em qual organizacao.
   */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(randomBytes(32).toString('base64url'));

    await argon2.verify(await this.dummyHash, password).catch(() => false);

    return false;
  }
}
