import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';

import { PatientText } from '@/modules/Patient/dtos/patientFields';

import {
  AudienceMatchesPatientIds,
  MAX_FORM_PATIENTS,
  PatientIdList,
} from '../dtos/formAudience';
import { FormFieldInputDto } from '../dtos/formFieldInput.dto';
import { FormFrequencyDto } from '../dtos/formFrequency.dto';
import { FORM_AUDIENCES, type FormAudience } from '../types/form.types';

export const MAX_FORM_FIELDS = 100;

/** UC09 passos 2 a 4: nasce como rascunho; publicar e outra rota. */
export class CreateFormDto {
  @ApiProperty({ example: 'Acompanhamento Geral', maxLength: 120 })
  @PatientText('O nome', 120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true, type: String })
  @IsOptional()
  @PatientText('A descricao', 1000)
  description?: string | null;

  @ApiPropertyOptional({
    example: 'Dados clinicos',
    maxLength: 80,
    nullable: true,
    type: String,
    description: 'Tipo de acompanhamento em texto livre.',
  })
  @IsOptional()
  @PatientText('O tipo de acompanhamento', 80)
  trackingType?: string | null;

  @ApiPropertyOptional({ type: FormFrequencyDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => FormFrequencyDto)
  frequency?: FormFrequencyDto | null;

  @ApiProperty({ enum: [...FORM_AUDIENCES], example: 'organization' })
  @IsIn(FORM_AUDIENCES, {
    message: 'O publico deve ser organization ou patients.',
  })
  @AudienceMatchesPatientIds()
  audience!: FormAudience;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_FORM_PATIENTS,
    description:
      'Pacientes ativos da organizacao. Obrigatorio com `audience = patients`, proibido com `organization`.',
  })
  @PatientIdList()
  patientIds?: string[];

  @ApiProperty({
    type: [FormFieldInputDto],
    maxItems: MAX_FORM_FIELDS,
    description: 'Campos na ordem de exibicao. Lista vazia e FORM_EMPTY.',
  })
  @IsArray({ message: 'Os campos devem ser uma lista.' })
  @ArrayMaxSize(MAX_FORM_FIELDS, {
    message: `O formulario aceita ate ${MAX_FORM_FIELDS} campos.`,
  })
  @ValidateNested({ each: true })
  @Type(() => FormFieldInputDto)
  fields!: FormFieldInputDto[];
}
