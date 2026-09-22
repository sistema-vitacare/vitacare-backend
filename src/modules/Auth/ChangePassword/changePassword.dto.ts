import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
