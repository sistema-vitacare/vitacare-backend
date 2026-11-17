import { ApiProperty } from '@nestjs/swagger';

export class OpenAlertCountsDto {
  @ApiProperty({
    example: 7,
    minimum: 0,
    description: 'Alertas em aberto; soma das tres severidades.',
  })
  total!: number;

  @ApiProperty({ example: 2, minimum: 0, description: 'Abertos critical.' })
  critical!: number;

  @ApiProperty({ example: 3, minimum: 0, description: 'Abertos warning.' })
  warning!: number;

  @ApiProperty({ example: 2, minimum: 0, description: 'Abertos info.' })
  info!: number;
}

export class AlertSummaryDto {
  @ApiProperty({
    type: OpenAlertCountsDto,
    description:
      'Contadores da Figura 42: cada numero e o total de GET /alerts com status=open (e severity=<chave>) e os mesmos patientId e source.',
  })
  open!: OpenAlertCountsDto;
}
