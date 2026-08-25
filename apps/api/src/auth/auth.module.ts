import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';

import { type AppEnv } from '../config/env';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { createAuth } from './create-auth';

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      isGlobal: true,
      imports: [PrismaModule],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService<AppEnv, true>,
      ) => ({
        auth: createAuth(prisma, {
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          API_HOST: config.get('API_HOST', { infer: true }),
          API_PORT: config.get('API_PORT', { infer: true }),
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          CORS_ORIGINS: config.get('CORS_ORIGINS', { infer: true }),
          PUBLIC_WEB_ORIGIN: config.get('PUBLIC_WEB_ORIGIN', { infer: true }),
          BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
          BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
          AUTH_TRUSTED_ORIGINS: config.get('AUTH_TRUSTED_ORIGINS', {
            infer: true,
          }),
          ALLOW_DEMO_SEED: config.get('ALLOW_DEMO_SEED', { infer: true }),
        }),
        bodyParser: {
          json: { enabled: true, limit: '1mb' },
          urlencoded: { enabled: true, extended: false, limit: '1mb' },
        },
      }),
      inject: [PrismaService, ConfigService],
    }),
  ],
})
export class AuthModule {}
