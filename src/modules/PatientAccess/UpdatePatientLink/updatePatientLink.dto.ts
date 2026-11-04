import { ApiPropertyOptional } from '@nestjs/swagger';
import { ValidateIf } from 'class-validator';

import { PatientText } from '@/modules/Patient/dtos/patientFields';

const filled = (_object: unknown, value: unknown) =>
  value !== undefined && value !== null;

/** Campo ausente nao muda; `null` limpa. Paciente e usuario nao mudam. */
export class UpdatePatientLinkDto {
  @ApiPropertyOptional({
    example: 'Neta',
    maxLength: 40,
    nullable: true,
    type: String,
  })
  @ValidateIf(filled)
  @PatientText('O tipo de vinculo', 40)
  linkType?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @ValidateIf(filled)
  @PatientText('A observacao', 500)
  note?: string | null;
}
