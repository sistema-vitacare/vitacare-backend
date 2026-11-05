import {
  DoseAmountField,
  DoseUnitField,
  EndDateField,
  IntervalDaysField,
  NameField,
  NotesField,
  RemindersEnabledField,
  RouteField,
  StartDateField,
  TimesField,
} from '../dtos/medicationFields';
import type {
  MedicationDoseUnit,
  MedicationRoute,
} from '../types/medication.types';

/**
 * Campo ausente nao muda; `null` so limpa via, observacao e fim (volta a uso
 * continuo). O paciente nao muda. Mudar inicio, fim, intervalo, horarios ou
 * lembretes renova a agenda; status tem rotas proprias.
 */
export class UpdateMedicationDto {
  @NameField('patch')
  name?: string;

  @DoseAmountField('patch')
  doseAmount?: number;

  @DoseUnitField('patch')
  doseUnit?: MedicationDoseUnit;

  @RouteField()
  route?: MedicationRoute | null;

  @NotesField()
  notes?: string | null;

  @StartDateField('patch')
  startDate?: string;

  @EndDateField(false)
  endDate?: string | null;

  @IntervalDaysField('patch')
  intervalDays?: number;

  @TimesField('patch')
  times?: string[];

  @RemindersEnabledField('patch')
  remindersEnabled?: boolean;
}
