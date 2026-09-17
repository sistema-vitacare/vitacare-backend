import {
  Logger,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/allExceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/http/responseEnvelope.interceptor';
import { validationExceptionFactory } from './common/http/validationException.factory';

export interface AppSetupOptions {
  apiPrefix: string;
  apiVersion: string;
  isProduction: boolean;
  corsOrigins: string[];
  corsCredentials: boolean;
  swaggerEnabled: boolean;
  swaggerPath: string;
}

/**
 * Sem origens configuradas: libera tudo em desenvolvimento e desliga o CORS em
 * producao. Um frontend so passa a ser aceito quando entra em CORS_ORIGINS.
 */
export const resolveCors = (
  origins: string[],
  credentials: boolean,
  isProduction: boolean,
): CorsOptions | false => {
  if (origins.length > 0) {
    return { origin: origins, credentials };
  }

  return isProduction ? false : { origin: true, credentials };
};

/**
 * Toda a configuracao HTTP da aplicacao em um unico lugar, para que o bootstrap
 * de producao e os testes e2e exercitem exatamente o mesmo pipeline.
 */
export const setupApp = (
  app: NestExpressApplication,
  options: AppSetupOptions,
): { docsPath: string } => {
  const logger = new Logger('AppSetup');
  const docsPath = `/${options.apiPrefix}/${options.swaggerPath}`;

  // A UI do Swagger depende de scripts inline; o CSP e removido apenas nela.
  const secureDefault = helmet();
  const secureDocs = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(docsPath)
      ? secureDocs(req, res, next)
      : secureDefault(req, res, next),
  );

  const cors = resolveCors(
    options.corsOrigins,
    options.corsCredentials,
    options.isProduction,
  );

  if (cors === false) {
    logger.warn(
      'CORS_ORIGINS vazio em producao: nenhuma origem cross-origin sera aceita.',
    );
  } else {
    app.enableCors(cors);
  }

  app.setGlobalPrefix(options.apiPrefix, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: options.apiVersion,
  });

  // Health mantem o relatorio do Terminus e a documentacao mantem HTML/OpenAPI
  // puros: as duas ficam fora do envelope e do novo formato de erro.
  const excludedPaths = ['/health', docsPath];

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(excludedPaths));
  app.useGlobalFilters(new AllExceptionsFilter(excludedPaths));
  app.enableShutdownHooks();

  if (options.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VitaCare API')
        .setDescription('Backend HTTP do VitaCare.')
        .setVersion(options.apiVersion)
        .addBearerAuth()
        .build(),
    );

    SwaggerModule.setup(docsPath, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  return { docsPath };
};
