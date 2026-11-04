import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class PublishFormDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Confirma o impacto de substituir a versao vigente (UC09). Dispensado na primeira publicacao.',
  })
  @IsOptional()
  @IsBoolean({ message: 'confirmImpact deve ser true ou false.' })
  confirmImpact?: boolean;
}
