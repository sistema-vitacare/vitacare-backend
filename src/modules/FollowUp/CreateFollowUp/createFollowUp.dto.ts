import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

import { MAX_FORM_FIELDS } from '@/modules/Form/CreateForm/createForm.dto';
import { PatientText } from '@/modules/Patient/dtos/patientFields';
import { LowerTrim } from '@/modules/User/dtos/userFields';

export class AnswerInputDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Campo da versao respondida (`currentVersion.fields[].id`).',
  })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do campo.' })
  fieldId!: string;

  @ApiProperty({
    nullable: true,
    oneOf: [
      { type: 'number' },
      { type: 'boolean' },
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
    ],
    example: 0,
    description:
      'number: numero ou texto decimal com ate `decimalPlaces` casas; scale: inteiro na escala; boolean: true/false; text: ate 2000 caracteres; single_choice: uma opcao; multiple_choice: lista de opcoes. `null`, texto em branco e `[]` sao vazio; `0` e `false` sao valores.',
  })
  @Allow()
  value!: unknown;
}

export class CreateFollowUpDto {
  @ApiProperty({ format: 'uuid' })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId!: string;

  @ApiProperty({ format: 'uuid' })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do formulario.' })
  formId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Versao vigente que o cuidador preencheu (`currentVersion.id`). Se outra versao for publicada antes do envio, o registro e recusado com FOLLOW_UP_FORM_VERSION_OUTDATED.',
  })
  @LowerTrim()
  @IsUUID('all', {
    message: 'Informe o identificador da versao do formulario.',
  })
  formVersionId!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Data e hora da visita (ISO 8601 com fuso). Omitida = momento do envio. Nao pode estar no futuro.',
    example: '2026-11-04T09:30:00-03:00',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'Informe a data da visita em ISO 8601 com fuso.' },
  )
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'Informe a data da visita em ISO 8601 com fuso.',
  })
  visitedAt?: string;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Observacoes da visita (Figuras 38 e 40).',
  })
  @IsOptional()
  @PatientText('As observacoes', 2000)
  notes?: string;

  @ApiProperty({
    type: [AnswerInputDto],
    maxItems: MAX_FORM_FIELDS,
    description:
      'Respostas por campo. Campo omitido ou vazio nao gera item. Nenhum valor preenchido e FOLLOW_UP_EMPTY.',
  })
  @IsArray({ message: 'As respostas devem ser uma lista.' })
  @ArrayMaxSize(MAX_FORM_FIELDS, {
    message: `O registro aceita ate ${MAX_FORM_FIELDS} respostas.`,
  })
  @ValidateNested({ each: true })
  @Type(() => AnswerInputDto)
  answers!: AnswerInputDto[];
}
