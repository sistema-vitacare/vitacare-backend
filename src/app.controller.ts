import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope } from './common/http/apiEnvelope.decorator';
import { Public } from './modules/Auth/guards/public.decorator';

export class ServiceIdentityDto {
  @ApiProperty({ example: 'vitacare-backend' })
  name!: string;

  @ApiProperty({ example: 'running' })
  status!: string;

  @ApiProperty({
    example: '3f2c1a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39',
    description:
      'Commit da imagem em execucao; `dev` fora de uma imagem de build.',
  })
  version!: string;
}

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Identificacao do servico' })
  @ApiEnvelope(ServiceIdentityDto)
  index(): ServiceIdentityDto {
    return {
      name: 'vitacare-backend',
      status: 'running',
      // O pipeline de deploy compara este valor com o commit publicado.
      version: this.config.getOrThrow<string>('app.version'),
    };
  }
}
