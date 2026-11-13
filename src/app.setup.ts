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
import { BEARER_SECURITY_SCHEME } from './common/http/bearerAuth';
import { RequestMetadataInterceptor } from './common/http/requestMetadata.interceptor';
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
  /**
   * `trust proxy` do Express. Atras de proxy, sem isto `req.ip` vira o IP do
   * nginx e todos os clientes dividem o mesmo balde do rate limit.
   */
  trustProxy?: false | number | string;
}

/**
 * Sem origens configuradas: libera tudo em desenvolvimento e desliga o CORS em
 * producao. Um frontend so passa a ser aceito quando entra em CORS_ORIGINS.
 * O navegador so entrega ao frontend de outra origem o nome do arquivo baixado
 * (anexo, PDF, CSV) se `Content-Disposition` estiver exposto.
 */
export const resolveCors = (
  origins: string[],
  credentials: boolean,
  isProduction: boolean,
): CorsOptions | false => {
  const exposedHeaders = ['Content-Disposition'];

  if (origins.length > 0) {
    return { origin: origins, credentials, exposedHeaders };
  }

  return isProduction ? false : { origin: true, credentials, exposedHeaders };
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

  app.set('trust proxy', options.trustProxy ?? false);

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
      // Pagina publica do termo de uso (BE-32), linkada no rodape e no e-mail.
      { path: 'termos', method: RequestMethod.GET },
    ],
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: options.apiVersion,
  });

  // Health mantem o relatorio do Terminus, a documentacao mantem HTML/OpenAPI
  // puros e a pagina do termo e HTML: ficam fora do envelope e do formato de erro.
  const excludedPaths = ['/health', docsPath, '/termos'];

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalInterceptors(
    new RequestMetadataInterceptor(),
    new ResponseEnvelopeInterceptor(excludedPaths),
  );
  app.useGlobalFilters(new AllExceptionsFilter(excludedPaths));
  app.enableShutdownHooks();

  if (options.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VitaCare API')
        .setDescription('Backend HTTP do VitaCare.')
        .setVersion(options.apiVersion)
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            description:
              'Token opaco de sessao emitido por POST /auth/login. Enviar como `Authorization: Bearer <token>`. Enquanto o usuario nao aceitar a versao vigente do termo de uso (BE-32), toda rota protegida responde `403 TERMS_ACCEPTANCE_REQUIRED`, exceto ler a propria sessao (`GET /profile`), aceitar o termo (`POST /terms/acceptances`), listar os proprios aceites (`GET /terms/acceptances/me`), parar o push deste navegador (`POST /notifications/push-subscriptions/revoke`) e sair (`POST /auth/logout`).',
          },
          BEARER_SECURITY_SCHEME,
        )
        .build(),
    );

    // So o JSON: o contrato publicado e `/docs-json`; o YAML seria uma rota a
    // mais sem nota no manual.
    SwaggerModule.setup(docsPath, app, document, {
      raw: ['json'],
      swaggerOptions: { persistAuthorization: true },
    });
  }

  return { docsPath };
};
