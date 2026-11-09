import { ApiProperty } from '@nestjs/swagger';

import { DashboardPeriodDto, DashboardRefDto } from '../dtos/dashboard.dto';

export class DashboardPatientsByResponsibleDto {
  @ApiProperty({
    type: DashboardRefDto,
    description: 'Profissional responsavel vigente.',
  })
  professional!: DashboardRefDto;

  @ApiProperty({
    minimum: 1,
    example: 40,
    description: 'Pacientes ativos sob sua responsabilidade.',
  })
  active!: number;
}

/** Detalhe do indicador de pacientes (UC05 passo 4). */
export class DashboardPatientsDto {
  @ApiProperty({ type: DashboardPeriodDto })
  period!: DashboardPeriodDto;

  @ApiProperty({ minimum: 0, example: 128, description: 'Ativos agora.' })
  active!: number;

  @ApiProperty({ minimum: 0, example: 9, description: 'Inativos agora.' })
  inactive!: number;

  @ApiProperty({
    minimum: 0,
    example: 12,
    description: 'Cadastrados no periodo, em qualquer situacao atual.',
  })
  newInPeriod!: number;

  @ApiProperty({
    type: [DashboardPatientsByResponsibleDto],
    description:
      'Pacientes ativos por profissional responsavel, do maior para o menor.',
  })
  byResponsible!: DashboardPatientsByResponsibleDto[];
}
