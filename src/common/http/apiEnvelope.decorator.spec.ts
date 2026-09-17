import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import {
  ApiProperty,
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { ApiEnvelope } from './apiEnvelope.decorator';
import { ApiErrors } from './apiErrors.decorator';

class ProbeDto {
  @ApiProperty() id!: string;
}

@Controller('probe')
class ProbeController {
  @Get()
  @ApiEnvelope(ProbeDto)
  @ApiErrors({ status: HttpStatus.CONFLICT, codes: ['PROBE_DUPLICATE'] })
  find(): ProbeDto {
    return { id: 'x' };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

interface RefSchema {
  $ref?: string;
}

interface ProbeSchema {
  properties?: Record<string, RefSchema>;
  allOf?: { properties?: Record<string, RefSchema> }[];
}

interface ProbeResponse {
  description?: string;
  content?: Record<string, { schema: ProbeSchema }>;
}

describe('ApiEnvelope e ApiErrors', () => {
  const documentOf = async (): Promise<OpenAPIObject> => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('probe').setVersion('1').build(),
    );

    await app.close();
    return document;
  };

  const responseOf = (document: OpenAPIObject, status: string): ProbeResponse =>
    document.paths['/probe'].get?.responses[status] as ProbeResponse;

  it('documenta data e meta no corpo de sucesso', async () => {
    const document = await documentOf();
    const schema = responseOf(document, '200').content?.['application/json']
      .schema;

    const properties =
      schema?.allOf?.[0]?.properties ?? schema?.properties ?? {};

    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(['data', 'meta']),
    );
    expect(properties.data.$ref).toContain('ProbeDto');
    expect(properties.meta.$ref).toContain('ResponseMetaDto');
  });

  it('documenta o status de erro com os codigos possiveis', async () => {
    const document = await documentOf();

    expect(responseOf(document, '409').description).toContain(
      'PROBE_DUPLICATE',
    );
  });
});
