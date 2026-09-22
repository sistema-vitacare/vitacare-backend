import { TokenService } from './token.service';

describe('TokenService', () => {
  it('gera token de 32 bytes e hash SHA-256 deterministico', () => {
    const service = new TokenService();
    const token = service.issue();

    expect(Buffer.from(token.raw, 'base64url')).toHaveLength(32);
    expect(token.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hash(token.raw)).toBe(token.hash);
  });
});
