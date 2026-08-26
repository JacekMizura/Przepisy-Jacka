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
          BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
          BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
          AUTH_TRUSTED_ORIGINS: config.get('AUTH_TRUSTED_ORIGINS', {
            infer: true,
          }),
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
