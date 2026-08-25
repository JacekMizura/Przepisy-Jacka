import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { KitchensModule } from './kitchens/kitchens.module';
import { PrismaModule } from './prisma/prisma.module';
import { ShoppingModule } from './shopping/shopping.module';
import { StockModule } from './stock/stock.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    UsersModule,
    KitchensModule,
    StockModule,
    ShoppingModule,
  ],
})
export class AppModule {}
