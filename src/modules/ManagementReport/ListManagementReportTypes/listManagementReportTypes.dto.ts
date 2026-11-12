import { ApiProperty } from '@nestjs/swagger';

import { MANAGEMENT_REPORT_TYPES } from '../types/managementReport.types';

/** Item do catalogo da Figura 43. */
export class ManagementReportTypeDto {
  @ApiProperty({ enum: MANAGEMENT_REPORT_TYPES, example: 'alerts' })
  type!: string;

  @ApiProperty({ example: 'Alertas e intercorrências' })
  name!: string;

  @ApiProperty({
    example: 'Alertas emitidos, criticidade e resolução no período.',
  })
  description!: string;

  @ApiProperty({
    example: '/management-reports/alerts',
    description: 'Rota JSON, relativa a base da API (`/api/v1`).',
  })
  path!: string;

  @ApiProperty({ example: '/management-reports/alerts/pdf' })
  pdfPath!: string;

  @ApiProperty({ type: [String], example: ['pdf'] })
  formats!: string[];

  @ApiProperty({
    minimum: 0,
    example: 12,
    description: 'Exportacoes em PDF ja feitas na organizacao ("N gerados").',
  })
  exportCount!: number;
}
