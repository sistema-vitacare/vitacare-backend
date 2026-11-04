import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

import { CreatePatientDto } from '../CreatePatient/createPatient.dto';
import { IsBirthDate, PatientText } from '../dtos/patientFields';

const present = (_object: unknown, value: unknown) => value !== undefined;

/**
 * Campo ausente nao muda; `null` limpa os opcionais. Nome, nascimento e
 * responsavel nao aceitam `null`. Status tem rotas proprias.
 */
export class UpdatePatientDto extends PartialType(
  OmitType(CreatePatientDto, [
    'name',
    'birthDate',
    'responsibleUserId',
  ] as const),
) {
  @ApiPropertyOptional({ example: 'Paciente Exemplo', maxLength: 180 })
  @ValidateIf(present)
  @PatientText('O nome', 180)
  name?: string;

  @ApiPropertyOptional({ format: 'date', example: '1948-03-12' })
  @ValidateIf(present)
  @IsBirthDate({
    message:
      'Informe uma data de nascimento valida, no formato AAAA-MM-DD e nao futura.',
  })
  birthDate?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Novo profissional responsavel; encerra o vinculo vigente e abre outro.',
  })
  @ValidateIf(present)
  @IsUUID('all', {
    message: 'Informe o identificador do profissional responsavel.',
  })
  responsibleUserId?: string;
}
