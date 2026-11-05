import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { LowerTrim } from '@/modules/User/dtos/userFields';

import {
  OperatorField,
  ReferenceValueField,
  RuleDescriptionField,
  RuleNameField,
  SeverityField,
} from '../dtos/alertRuleFields';
import type { AlertRuleOperator, AlertSeverity } from '../types/alert.types';

/**
 * UC09 passo 5: regra sobre um campo numerico ou de escala da versao
 * publicada vigente. Sem `patientId` vale para todos os pacientes do
 * formulario; com ele, substitui as regras gerais do campo para esse paciente.
 */
export class CreateAlertRuleDto {
  @ApiProperty({ format: 'uuid', description: 'Formulario ativo.' })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do formulario.' })
  formId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      '`fieldKey` do campo na versao publicada vigente; tipo `number` ou `scale`.',
  })
  @LowerTrim()
  @IsUUID('all', { message: 'Informe a chave do campo (fieldKey).' })
  fieldKey!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Paciente ativo a que o formulario se aplica; omitido ou `null` = regra geral.',
  })
  @IsOptional()
  @LowerTrim()
  @IsUUID('all', { message: 'Informe o identificador do paciente.' })
  patientId?: string | null;

  @RuleNameField('required')
  name!: string;

  @RuleDescriptionField()
  description?: string | null;

  @OperatorField('required')
  operator!: AlertRuleOperator;

  @ReferenceValueField('required')
  referenceValue!: number;

  @SeverityField('required')
  severity!: AlertSeverity;
}
