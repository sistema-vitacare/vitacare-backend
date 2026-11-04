import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { PatientText } from '@/modules/Patient/dtos/patientFields';
import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  FIELD_REQUIREMENTS,
  FIELD_TYPES,
  type FieldRequirement,
  type FieldType,
} from '../types/form.types';

/**
 * Campo enviado na criacao ou no rascunho. A posicao e a ordem na lista. O
 * que cada tipo exige ou proibe e conferido depois, com erro por campo.
 */
export class FormFieldInputDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Chave de um campo que continua de uma versao publicada ou do rascunho deste formulario. Sem ela o campo e novo. A chave nao muda de tipo.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'A chave do campo deve ser um identificador.' })
  fieldKey?: string;

  @ApiProperty({ example: 'Pressao arterial sistolica', maxLength: 120 })
  @PatientText('O nome do campo', 120)
  name!: string;

  @ApiProperty({ enum: [...FIELD_TYPES], example: 'number' })
  @IsIn(FIELD_TYPES, { message: 'Tipo de campo invalido.' })
  fieldType!: FieldType;

  @ApiProperty({
    enum: [...FIELD_REQUIREMENTS],
    example: 'required',
    description:
      'Obrigatorio, opcional ou desabilitado (Figura 39). Desabilitado fica na versao mas nao aceita valor.',
  })
  @IsIn(FIELD_REQUIREMENTS, {
    message: 'A obrigatoriedade deve ser required, optional ou disabled.',
  })
  requirement!: FieldRequirement;

  @ApiPropertyOptional({
    example: 'Sinais vitais',
    maxLength: 60,
    nullable: true,
    type: String,
    description: 'Secao (aba) em que o campo aparece.',
  })
  @IsOptional()
  @PatientText('A secao', 60)
  section?: string | null;

  @ApiPropertyOptional({
    example: 'mmHg',
    maxLength: 20,
    nullable: true,
    type: String,
    description: 'Unidade de medida. So em `number`.',
  })
  @IsOptional()
  @PatientText('A unidade', 20)
  unit?: string | null;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 3,
    nullable: true,
    type: Number,
    description: 'Casas decimais aceitas. Obrigatorio e so em `number`.',
  })
  @IsOptional()
  @IsInt({ message: 'As casas decimais devem ser um numero inteiro.' })
  @Min(0, { message: 'As casas decimais vao de 0 a 3.' })
  @Max(3, { message: 'As casas decimais vao de 0 a 3.' })
  decimalPlaces?: number | null;

  @ApiPropertyOptional({
    minimum: -1000,
    maximum: 1000,
    nullable: true,
    type: Number,
    example: 0,
    description: 'Inicio da escala. Obrigatorio e so em `scale`.',
  })
  @IsOptional()
  @IsInt({ message: 'O inicio da escala deve ser inteiro.' })
  @Min(-1000, { message: 'A escala vai de -1000 a 1000.' })
  @Max(1000, { message: 'A escala vai de -1000 a 1000.' })
  scaleMin?: number | null;

  @ApiPropertyOptional({
    minimum: -1000,
    maximum: 1000,
    nullable: true,
    type: Number,
    example: 10,
    description:
      'Fim da escala, maior que o inicio. Obrigatorio e so em `scale`.',
  })
  @IsOptional()
  @IsInt({ message: 'O fim da escala deve ser inteiro.' })
  @Min(-1000, { message: 'A escala vai de -1000 a 1000.' })
  @Max(1000, { message: 'A escala vai de -1000 a 1000.' })
  scaleMax?: number | null;

  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    minItems: 2,
    maxItems: 50,
    example: ['Boa', 'Regular', 'Ruim'],
    description:
      'Opcoes, sem repeticao. Obrigatorio e so em `single_choice` e `multiple_choice`.',
  })
  @IsOptional()
  @IsArray({ message: 'As opcoes devem ser uma lista.' })
  @ArrayMinSize(2, { message: 'Informe ao menos 2 opcoes.' })
  @ArrayMaxSize(50, { message: 'A lista aceita ate 50 opcoes.' })
  @PatientText('Cada opcao', 120, { each: true })
  options?: string[] | null;
}
