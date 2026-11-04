import { ApiProperty } from '@nestjs/swagger';

import { FIELD_TYPES } from '@/modules/Form/types/form.types';

import { FOLLOW_UP_STATUSES } from '../types/followUp.types';

export class UserRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ana Cuidadora' })
  name!: string;
}

export class FollowUpFormRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Acompanhamento Geral' })
  name!: string;

  @ApiProperty({ format: 'uuid' })
  versionId!: string;

  @ApiProperty({ minimum: 1, example: 1 })
  versionNumber!: number;
}

export class FollowUpAnswerDto {
  @ApiProperty({ format: 'uuid', description: 'Campo da versao respondida.' })
  fieldId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Identidade do campo atraves das versoes.',
  })
  fieldKey!: string;

  @ApiProperty({ example: 'Glicemia capilar' })
  name!: string;

  @ApiProperty({ enum: [...FIELD_TYPES], example: 'number' })
  fieldType!: string;

  @ApiProperty({ nullable: true, type: String, example: 'mg/dL' })
  unit!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'Sinais vitais' })
  section!: string | null;

  @ApiProperty({ minimum: 0, example: 0 })
  position!: number;

  @ApiProperty({
    oneOf: [
      { type: 'number' },
      { type: 'boolean' },
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
    ],
    example: 324,
    description:
      'number/scale: numero; boolean: booleano; text/single_choice: texto; multiple_choice: lista na ordem das opcoes.',
  })
  value!: number | boolean | string | string[];
}

export class FollowUpAnnulmentDto {
  @ApiProperty({ format: 'date-time' })
  annulledAt!: string;

  @ApiProperty({ type: UserRefDto })
  annulledBy!: UserRefDto;

  @ApiProperty({ example: 'Glicemia digitada errada; registro refeito.' })
  reason!: string;
}

export class FollowUpDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  patientId!: string;

  @ApiProperty({ type: FollowUpFormRefDto })
  form!: FollowUpFormRefDto;

  @ApiProperty({
    type: UserRefDto,
    description: 'Cuidador que registrou (vem da sessao).',
  })
  author!: UserRefDto;

  @ApiProperty({ format: 'date-time', description: 'Data e hora da visita.' })
  visitedAt!: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Momento em que o servidor gravou o registro.',
  })
  submittedAt!: string;

  @ApiProperty({ nullable: true, type: String })
  notes!: string | null;

  @ApiProperty({ enum: [...FOLLOW_UP_STATUSES], example: 'valid' })
  status!: string;

  @ApiProperty({ type: FollowUpAnnulmentDto, nullable: true })
  annulment!: FollowUpAnnulmentDto | null;

  @ApiProperty({
    type: [FollowUpAnswerDto],
    description: 'Campos preenchidos, na ordem da versao respondida.',
  })
  answers!: FollowUpAnswerDto[];
}
