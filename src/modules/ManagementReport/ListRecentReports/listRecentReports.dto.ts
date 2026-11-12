import { ApiProperty } from '@nestjs/swagger';

import { ReportPersonRefDto } from '../dtos/managementReport.dto';
import { MANAGEMENT_REPORT_TYPES } from '../types/managementReport.types';

export class RecentReportScopeDto {
  @ApiProperty({
    enum: ['patient', 'condition', 'all'],
    example: 'all',
    description:
      'Paciente (individual), condicao filtrada ou todos os pacientes.',
  })
  kind!: string;

  @ApiProperty({ type: ReportPersonRefDto, nullable: true })
  patient!: ReportPersonRefDto | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  condition!: string | null;
}

export class RecentReportPeriodDto {
  @ApiProperty({ type: String, format: 'date', nullable: true })
  from!: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  to!: string | null;
}

/** Exportacao auditada; nada fica guardado, entao gerar de novo e repetir o pedido. */
export class RecentReportDto {
  @ApiProperty({ format: 'uuid', description: 'Id do evento de auditoria.' })
  id!: string;

  @ApiProperty({ enum: MANAGEMENT_REPORT_TYPES, example: 'alerts' })
  type!: string;

  @ApiProperty({ type: RecentReportScopeDto })
  scope!: RecentReportScopeDto;

  @ApiProperty({ type: RecentReportPeriodDto })
  period!: RecentReportPeriodDto;

  @ApiProperty({ example: 'pdf' })
  format!: string;

  @ApiProperty({ type: ReportPersonRefDto, nullable: true })
  generatedBy!: ReportPersonRefDto | null;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;
}
