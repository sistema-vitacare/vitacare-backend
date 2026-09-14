import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

export class ServiceIdentityDto {
  @ApiProperty({ example: 'vitacare-backend' })
  name!: string;

  @ApiProperty({ example: 'running' })
  status!: string;
}

@ApiTags('app')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Identificacao do servico' })
  @ApiOkResponse({ type: ServiceIdentityDto })
  index(): ServiceIdentityDto {
    return { name: 'vitacare-backend', status: 'running' };
  }
}
