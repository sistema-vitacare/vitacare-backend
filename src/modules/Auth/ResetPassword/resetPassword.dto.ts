import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
export class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(512) token!: string;
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
