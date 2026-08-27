import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppEnv } from '../config/env';
import { FixtureOpenFoodFactsClient } from './fixture-open-food-facts.client';
import { HttpOpenFoodFactsClient } from './http-open-food-facts.client';
import { OPEN_FOOD_FACTS_CLIENT } from './open-food-facts.client';
import { NutritionLookupController } from './nutrition-lookup.controller';
import { NutritionLookupService } from './nutrition-lookup.service';

export function createOpenFoodFactsClient(
  config: ConfigService<AppEnv, true>,
  fixture: FixtureOpenFoodFactsClient,
) {
  const driver = config.get('OPEN_FOOD_FACTS_DRIVER', { infer: true });
  if (driver === 'fixture') {
    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(
        'OPEN_FOOD_FACTS_DRIVER=fixture jest dostępny wyłącznie poza produkcją.',
      );
    }
    return fixture;
  }
  return new HttpOpenFoodFactsClient(config);
}

@Module({
  controllers: [NutritionLookupController],
  providers: [
    FixtureOpenFoodFactsClient,
    {
      provide: OPEN_FOOD_FACTS_CLIENT,
      inject: [ConfigService, FixtureOpenFoodFactsClient],
      useFactory: createOpenFoodFactsClient,
    },
    NutritionLookupService,
  ],
  exports: [NutritionLookupService, FixtureOpenFoodFactsClient],
})
export class OpenFoodFactsModule {}
