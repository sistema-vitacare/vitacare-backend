import { ApiProperty } from '@nestjs/swagger';

export class ResetUserPasswordAsAdminResponseDto {
  @ApiProperty({
    description:
      'Senha provisoria exibida uma unica vez; o usuario troca no proximo acesso.',
  })
  temporaryPassword!: string;

  @ApiProperty({
    format: 'date-time',
    description:
      'Fim da validade da senha provisoria. Depois dele o login falha como credencial invalida e o administrador emite outra.',
  })
  expiresAt!: Date;
}
