import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'clinica-exemplo' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MinLength(3)
  @MaxLength(50)
  organizationCode!: string;
  @ApiProperty({ example: 'usuario@example.test' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty({ enum: ['authenticated', 'password_change_required'] }) state!:
    'authenticated' | 'password_change_required';
  @ApiProperty() accessToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: 'Bearer';
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ required: false }) idleTimeoutSeconds?: number;
}
