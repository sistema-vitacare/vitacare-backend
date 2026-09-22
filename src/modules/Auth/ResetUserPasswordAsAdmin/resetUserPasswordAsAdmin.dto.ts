import { ApiProperty } from '@nestjs/swagger';

export class ResetUserPasswordAsAdminResponseDto {
  @ApiProperty({
    description:
      'Senha provisoria exibida uma unica vez; o usuario troca no proximo acesso.',
  })
  temporaryPassword!: string;
}
