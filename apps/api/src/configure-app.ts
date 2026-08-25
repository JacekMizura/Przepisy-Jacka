import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { type AppEnv, parseCorsOrigins } from './config/env';

export function configureApp(
  app: INestApplication,
  options?: { enableSwagger?: boolean },
): void {
  const config = app.get(ConfigService<AppEnv, true>);
  const corsOrigins = parseCorsOrigins(
    config.get('CORS_ORIGINS', { infer: true }),
  );

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (options?.enableSwagger) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup('docs', app, document, {
      useGlobalPrefix: false,
    });
  }
}

export function buildOpenApiDocument(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Moja Kuchnia API')
    .setDescription('REST API aplikacji Moja Kuchnia')
    .setVersion('0.1.0')
    .addServer('http://localhost:3001')
    .addCookieAuth('better-auth.session_token')
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig);
}
