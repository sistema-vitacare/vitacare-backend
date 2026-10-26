import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';

describe('PasswordHasher', () => {
  it('gera hash Argon2id e valida a senha original', async () => {
    const hasher = new PasswordHasher();
    const hash = await hasher.hash('senha válida 123');

    expect(hash).toContain('$argon2id$');
    await expect(hasher.verify(hash, 'senha válida 123')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'outra senha')).resolves.toBe(false);
  });
});
