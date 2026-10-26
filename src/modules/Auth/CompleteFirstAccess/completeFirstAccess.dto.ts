import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteFirstAccessDto {
  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    description: 'Senha definitiva; espacos e Unicode sao preservados.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
