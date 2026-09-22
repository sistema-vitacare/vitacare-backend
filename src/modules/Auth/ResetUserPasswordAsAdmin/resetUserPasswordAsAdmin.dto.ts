import { ApiProperty } from '@nestjs/swagger';
export class ResetUserPasswordAsAdminResponseDto {
  @ApiProperty() temporaryPassword!: string;
}
