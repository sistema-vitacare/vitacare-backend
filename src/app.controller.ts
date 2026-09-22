import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope } from './common/http/apiEnvelope.decorator';
import { Public } from './modules/Auth/guards/public.decorator';

export class ServiceIdentityDto {
  @ApiProperty({ example: 'vitacare-backend' })
  name!: string;

  @ApiProperty({ example: 'running' })
  status!: string;
}

@ApiTags('app')
@Controller()
export class AppController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Identificacao do servico' })
  @ApiEnvelope(ServiceIdentityDto)
  index(): ServiceIdentityDto {
    return { name: 'vitacare-backend', status: 'running' };
  }
}
