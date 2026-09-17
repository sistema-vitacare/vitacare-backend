import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsEmail, IsInt, Min, validateSync } from 'class-validator';
import { validationExceptionFactory } from './validationException.factory';

class ProbeDto {
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;

  @IsInt()
  @Min(0)
  idade!: number;
}

describe('validationExceptionFactory', () => {
  const errorsFor = (payload: Record<string, unknown>) =>
    validateSync(plainToInstance(ProbeDto, payload));

  it('devolve 422 com o codigo de validacao', () => {
    const exception = validationExceptionFactory(
      errorsFor({ email: 'nao-e-email', idade: -1 }),
    );

    expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(exception.code).toBe('VALIDATION_FAILED');
  });

  it('lista um item por restricao violada, com campo e codigo', () => {
    const exception = validationExceptionFactory(
      errorsFor({ email: 'nao-e-email', idade: 5 }),
    );

    expect(exception.fields).toEqual([
      {
        field: 'email',
        code: 'IS_EMAIL',
        message: 'Informe um e-mail valido.',
      },
    ]);
  });

  it('conta os campos invalidos no detail tecnico', () => {
    const exception = validationExceptionFactory(
      errorsFor({ email: 'x', idade: -1 }),
    );

    expect(exception.detail).toContain('2');
  });

  it('usa singular quando ha um unico campo invalido', () => {
    const exception = validationExceptionFactory(
      errorsFor({ email: 'x', idade: 5 }),
    );

    expect(exception.detail).toContain('1 campo invalido');
  });
});
