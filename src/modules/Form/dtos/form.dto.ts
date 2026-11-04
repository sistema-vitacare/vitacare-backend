import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  FIELD_REQUIREMENTS,
  FIELD_TYPES,
  FORM_AUDIENCES,
  FORM_STATUSES,
} from '../types/form.types';
import { FormFrequencyDto } from './formFrequency.dto';

export class FormFieldDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Campo desta versao: e o que respostas e regras de alerta referenciam.',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Identidade do campo atraves das versoes do formulario.',
  })
  fieldKey!: string;

  @ApiProperty({ example: 'Pressao arterial sistolica' })
  name!: string;

  @ApiProperty({ enum: [...FIELD_TYPES], example: 'number' })
  fieldType!: string;

  @ApiProperty({ enum: [...FIELD_REQUIREMENTS], example: 'required' })
  requirement!: string;

  @ApiProperty({ minimum: 0, example: 0, description: 'Ordem na versao.' })
  position!: number;

  @ApiProperty({ nullable: true, type: String, example: 'Sinais vitais' })
  section!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'mmHg' })
  unit!: string | null;

  @ApiProperty({ nullable: true, type: Number, example: 0 })
  decimalPlaces!: number | null;

  @ApiProperty({ nullable: true, type: Number, example: null })
  scaleMin!: number | null;

  @ApiProperty({ nullable: true, type: Number, example: null })
  scaleMax!: number | null;

  @ApiProperty({ nullable: true, type: [String], example: null })
  options!: string[] | null;
}

export class FormVersionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1, example: 1 })
  number!: number;

  @ApiProperty({ format: 'date-time' })
  publishedAt!: string;

  @ApiProperty({
    minimum: 0,
    example: 12,
    description: 'Campos nao desabilitados da versao.',
  })
  fieldCount!: number;
}

export class FormVersionDto extends FormVersionSummaryDto {
  @ApiProperty({ type: [FormFieldDto] })
  fields!: FormFieldDto[];
}

export class FormDraftDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time', description: 'Ultimo salvamento.' })
  updatedAt!: string;

  @ApiProperty({ type: [FormFieldDto] })
  fields!: FormFieldDto[];
}

class FormBaseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Acompanhamento Geral' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Dados clinicos',
    description: 'Tipo de acompanhamento em texto livre.',
  })
  trackingType!: string | null;

  @ApiProperty({
    enum: [...FORM_STATUSES],
    example: 'active',
    description:
      '`draft` nunca publicado, `active` com versao vigente, `inactive` desativado.',
  })
  status!: string;

  @ApiProperty({
    enum: [...FORM_AUDIENCES],
    example: 'organization',
    description: 'Vale para a organizacao inteira ou para `patientIds`.',
  })
  audience!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Pacientes da lista vigente; para o cuidador, so os do seu alcance.',
  })
  patientIds!: string[];

  @ApiProperty({ type: FormFrequencyDto, nullable: true })
  frequency!: FormFrequencyDto | null;

  @ApiProperty({
    description:
      'Ha rascunho pendente de publicacao. Sempre false para o cuidador.',
  })
  hasDraft!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  deactivatedAt!: string | null;
}

export class FormSummaryDto extends FormBaseDto {
  @ApiProperty({ type: FormVersionSummaryDto, nullable: true })
  currentVersion!: FormVersionSummaryDto | null;
}

export class FormDto extends FormBaseDto {
  @ApiProperty({ type: FormVersionDto, nullable: true })
  currentVersion!: FormVersionDto | null;

  @ApiPropertyOptional({
    type: FormDraftDto,
    nullable: true,
    description: 'Rascunho da proxima versao. Ausente para o cuidador.',
  })
  draft?: FormDraftDto | null;
}
