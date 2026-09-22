import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ORGANIZATION_CODE_PATTERN } from '../Login/login.dto';

export class RequestPasswordRecoveryDto {
  @ApiProperty({ example: 'clinica-exemplo', minLength: 3, maxLength: 50 })
  @IsString()
  @Matches(ORGANIZATION_CODE_PATTERN, {
    message: 'Informe o codigo da organizacao em minusculas, com hifens.',
  })
  @MinLength(3)
  @MaxLength(50)
  organizationCode!: string;

  @ApiProperty({ example: 'usuario@example.test', maxLength: 254 })
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(254)
  email!: string;
}
