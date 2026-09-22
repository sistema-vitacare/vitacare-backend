import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

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
