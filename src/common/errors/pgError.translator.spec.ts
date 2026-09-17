import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';
import { translatePgError } from './pgError.translator';

describe('translatePgError', () => {
  it('converte violacao de unicidade em 409 com codigo do recurso', () => {
    const result = translatePgError(
      {
        code: '23505',
        constraint: 'ux_patients_org_document',
        detail: 'Key (document)=(12345678900) already exists.',
      },
      'patients',
    );

    expect(result).toBeInstanceOf(DomainException);
    const error = result as DomainException;
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.code).toBe('PATIENTS_DUPLICATE');
    expect(error.detail).toContain('ux_patients_org_document');
  });

  it('nunca expoe o detail cru do driver, que carrega valor real', () => {
    const result = translatePgError(
      {
        code: '23505',
        constraint: 'ux_users_email',
        detail: 'Key (email)=(ana@example.com) already exists.',
      },
      'users',
    );

    expect((result as DomainException).detail).not.toContain('ana@example.com');
  });

  it('converte violacao de chave estrangeira em 409', () => {
    const result = translatePgError(
      { code: '23503', constraint: 'fk_followups_patient' },
      'followups',
    );

    expect((result as DomainException).code).toBe('FOLLOWUPS_FK_VIOLATION');
    expect((result as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('converte violacao de CHECK em 422', () => {
    const result = translatePgError(
      { code: '23514', constraint: 'ck_patients_status' },
      'patients',
    );

    expect((result as DomainException).getStatus()).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('devolve o erro original quando o codigo nao e mapeado', () => {
    const original = { code: '08006', message: 'connection failure' };
    expect(translatePgError(original, 'patients')).toBe(original);
  });

  it('devolve o erro original quando nao e erro do PostgreSQL', () => {
    const original = new Error('boom');
    expect(translatePgError(original, 'patients')).toBe(original);
  });
});
