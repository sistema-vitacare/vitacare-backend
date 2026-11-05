import {
  OperatorField,
  ReferenceValueField,
  RuleDescriptionField,
  RuleNameField,
  SeverityField,
} from '../dtos/alertRuleFields';
import type { AlertRuleOperator, AlertSeverity } from '../types/alert.types';

/**
 * Campo ausente nao muda; `null` so limpa a descricao. Formulario, campo e
 * paciente nao mudam: outra combinacao e outra regra. Alertas ja gerados
 * guardam a copia de antes.
 */
export class UpdateAlertRuleDto {
  @RuleNameField('patch')
  name?: string;

  @RuleDescriptionField()
  description?: string | null;

  @OperatorField('patch')
  operator?: AlertRuleOperator;

  @ReferenceValueField('patch')
  referenceValue?: number;

  @SeverityField('patch')
  severity?: AlertSeverity;
}
