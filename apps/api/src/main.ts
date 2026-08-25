import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { type AppEnv } from './config/env';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const config = app.get(ConfigService<AppEnv, true>);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const port = config.get('API_PORT', { infer: true });
  const host = config.get('API_HOST', { infer: true });

  configureApp(app, { enableSwagger: nodeEnv !== 'production' });

  await app.listen(port, host);

  const logger = new Logger('Bootstrap');
  logger.log(`API nasłuchuje na http://${host}:${port}/api`);
  if (nodeEnv !== 'production') {
    logger.log(`Swagger: http://localhost:${port}/docs`);
  }
}

void bootstrap();
