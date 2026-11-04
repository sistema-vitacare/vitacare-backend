import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';

import { OnlyDigits } from '@/modules/User/dtos/userFields';

import { BRAZILIAN_STATES, PatientText, UpperTrim } from './patientFields';

/** Endereco da Figura 35. Parte ausente nao muda; `null` limpa a parte. */
export class PatientAddressInputDto {
  @ApiPropertyOptional({
    example: '01310-100',
    nullable: true,
    type: String,
    description: 'CEP com ou sem hifen; gravado com 8 digitos.',
  })
  @IsOptional()
  @OnlyDigits()
  @Matches(/^[0-9]{8}$/, { message: 'Informe um CEP com 8 digitos.' })
  zipCode?: string | null;

  @ApiPropertyOptional({
    example: 'Avenida Exemplo',
    maxLength: 180,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @PatientText('O logradouro', 180)
  street?: string | null;

  @ApiPropertyOptional({
    example: '100',
    maxLength: 20,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @PatientText('O numero', 20)
  number?: string | null;

  @ApiPropertyOptional({
    example: 'Centro',
    maxLength: 120,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @PatientText('O bairro', 120)
  district?: string | null;

  @ApiPropertyOptional({
    example: 'Sao Paulo',
    maxLength: 120,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @PatientText('A cidade', 120)
  city?: string | null;

  @ApiPropertyOptional({
    enum: [...BRAZILIAN_STATES],
    example: 'SP',
    nullable: true,
    type: String,
    description: 'Sigla da UF, sem diferenciar maiusculas.',
  })
  @IsOptional()
  @UpperTrim()
  @IsIn(BRAZILIAN_STATES, { message: 'Informe uma UF valida.' })
  state?: string | null;
}
