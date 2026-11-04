import { ApiProperty } from '@nestjs/swagger';

import { PatientText } from '@/modules/Patient/dtos/patientFields';

export class AnnulFollowUpDto {
  @ApiProperty({
    maxLength: 500,
    example: 'Glicemia digitada errada; registro refeito.',
    description: 'Por que o registro deixa de valer. Aparece no historico.',
  })
  @PatientText('O motivo', 500)
  reason!: string;
}
