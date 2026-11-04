import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';

import { FREQUENCY_UNITS, type FrequencyUnit } from '../types/form.types';

/** Frequencia esperada de preenchimento (UC09 passo 4): a cada N unidades. */
export class FormFrequencyDto {
  @ApiProperty({ minimum: 1, maximum: 365, example: 1 })
  @IsInt({ message: 'O intervalo deve ser um numero inteiro.' })
  @Min(1, { message: 'O intervalo deve ser de ao menos 1.' })
  @Max(365, { message: 'O intervalo aceita ate 365.' })
  interval!: number;

  @ApiProperty({ enum: [...FREQUENCY_UNITS], example: 'days' })
  @IsIn(FREQUENCY_UNITS, {
    message: 'A unidade deve ser hours, days ou weeks.',
  })
  unit!: FrequencyUnit;
}
