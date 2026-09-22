import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

/** Tokens opacos de 256 bits; o banco so ve o SHA-256. */
@Injectable()
export class TokenService {
  hash(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  issue(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');

    return { raw, hash: this.hash(raw) };
  }
}
