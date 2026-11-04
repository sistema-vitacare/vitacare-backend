import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, ValidateIf, ValidateNested } from 'class-validator';

import { PatientText } from '@/modules/Patient/dtos/patientFields';

import {
  AudienceMatchesPatientIds,
  MAX_FORM_PATIENTS,
  PatientIdList,
} from '../dtos/formAudience';
import { FormFrequencyDto } from '../dtos/formFrequency.dto';
import { FORM_AUDIENCES, type FormAudience } from '../types/form.types';

const filled = (_object: unknown, value: unknown) =>
  value !== undefined && value !== null;

/**
 * Campo ausente nao muda; `null` limpa os opcionais. Campos do formulario
 * mudam pelo rascunho, nunca aqui.
 */
export class UpdateFormDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf((_object, value) => value !== undefined)
  @PatientText('O nome', 120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true, type: String })
  @ValidateIf(filled)
  @PatientText('A descricao', 1000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, type: String })
  @ValidateIf(filled)
  @PatientText('O tipo de acompanhamento', 80)
  trackingType?: string | null;

  @ApiPropertyOptional({
    type: FormFrequencyDto,
    nullable: true,
    description: '`null` remove a frequencia esperada.',
  })
  @ValidateIf(filled)
  @ValidateNested()
  @Type(() => FormFrequencyDto)
  frequency?: FormFrequencyDto | null;

  @ApiPropertyOptional({
    enum: [...FORM_AUDIENCES],
    description: 'Enviado junto com `patientIds` quando for `patients`.',
  })
  @ValidateIf(
    (object: UpdateFormDto) =>
      object.audience !== undefined || object.patientIds !== undefined,
  )
  @IsIn(FORM_AUDIENCES, {
    message: 'Informe o publico (organization ou patients).',
  })
  @AudienceMatchesPatientIds()
  audience?: FormAudience;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_FORM_PATIENTS,
    description: 'Substitui a lista inteira de pacientes.',
  })
  @PatientIdList()
  patientIds?: string[];
}
