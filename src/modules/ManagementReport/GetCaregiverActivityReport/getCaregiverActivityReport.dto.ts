import { ApiProperty } from '@nestjs/swagger';

import {
  ManagementReportHeaderDto,
  ReportPersonRefDto,
} from '../dtos/managementReport.dto';

export class ReportCaregiverRefDto extends ReportPersonRefDto {
  @ApiProperty({ enum: ['pending', 'active', 'inactive'], example: 'active' })
  status!: string;

  @ApiProperty({
    example: 'caregiver',
    description: 'Perfil atual do usuario (pode ter mudado depois do periodo).',
  })
  profile!: string;
}

export class CaregiverActivityDto {
  @ApiProperty({ type: ReportCaregiverRefDto })
  caregiver!: ReportCaregiverRefDto;

  @ApiProperty({
    minimum: 0,
    example: 4,
    description:
      'Pacientes com vinculo `caregiver` vigente em algum instante do periodo.',
  })
  linkedPatients!: number;

  @ApiProperty({
    minimum: 0,
    example: 18,
    description: 'Registros validos do cuidador com visita no periodo.',
  })
  validFollowUps!: number;

  @ApiProperty({
    minimum: 0,
    example: 1,
    description: 'Registros anulados do cuidador, pela data da visita.',
  })
  annulledFollowUps!: number;

  @ApiProperty({
    minimum: 0,
    example: 3,
    description:
      'Pacientes vinculados com ao menos um registro valido dele no periodo.',
  })
  patientsWithFollowUp!: number;

  @ApiProperty({
    minimum: 0,
    example: 1,
    description: 'Pacientes vinculados sem registro valido dele no periodo.',
  })
  patientsWithoutFollowUp!: number;

  @ApiProperty({
    minimum: 0,
    example: 2,
    description:
      'Alertas de ausencia emitidos no periodo para paciente vinculado a ele naquele instante.',
  })
  absenceAlerts!: number;

  @ApiProperty({
    minimum: 0,
    example: 5,
    description: 'Alertas que ele resolveu no periodo.',
  })
  resolvedAlerts!: number;
}

export class CaregiverActivitySummaryDto {
  @ApiProperty({ minimum: 0, example: 3 })
  caregivers!: number;

  @ApiProperty({
    minimum: 0,
    example: 9,
    description: 'Pacientes distintos vinculados a algum cuidador listado.',
  })
  linkedPatients!: number;

  @ApiProperty({ minimum: 0, example: 40 })
  validFollowUps!: number;

  @ApiProperty({ minimum: 0, example: 2 })
  annulledFollowUps!: number;

  @ApiProperty({
    minimum: 0,
    example: 3,
    description: 'Alertas de ausencia distintos (um alerta conta uma vez).',
  })
  absenceAlerts!: number;

  @ApiProperty({ minimum: 0, example: 7 })
  resolvedAlerts!: number;
}

/**
 * Relatorio "Atividade dos cuidadores" (Figura 43, BE-30): medidas objetivas,
 * sem nota, percentual ou classificacao de desempenho.
 */
export class CaregiverActivityReportDto extends ManagementReportHeaderDto {
  @ApiProperty({ type: CaregiverActivitySummaryDto })
  summary!: CaregiverActivitySummaryDto;

  @ApiProperty({
    type: [CaregiverActivityDto],
    description: 'Um item por cuidador, por nome.',
  })
  caregivers!: CaregiverActivityDto[];
}
