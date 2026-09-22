import { CreateAuthSchema1790000000000 } from '../src/database/migrations/1790000000000-CreateAuthSchema';

describe('schema de autenticacao', () => {
  it('declara a migration de sessoes e recuperacao', () => {
    expect(new CreateAuthSchema1790000000000().name).toBe(
      'CreateAuthSchema1790000000000',
    );
  });
});
