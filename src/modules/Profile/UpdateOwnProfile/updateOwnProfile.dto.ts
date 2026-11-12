import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

import { UpdateUserDto } from '@/modules/User/UpdateUser/updateUser.dto';

const present = (_object: unknown, value: unknown) => value !== undefined;

/**
 * Nome, e-mail e telefone com as mesmas validacoes da edicao pelo admin. CPF,
 * perfil, situacao e organizacao nao existem aqui: o `ValidationPipe` global
 * recusa campo desconhecido com 422.
 */
export class UpdateOwnProfileDto extends PickType(UpdateUserDto, [
  'name',
  'email',
  'phone',
] as const) {
  @ApiPropertyOptional({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    description:
      'Senha atual. Exigida so quando `email` muda; nunca gravada. Ignorada nos demais casos.',
  })
  @ValidateIf(present)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword?: string;
}
