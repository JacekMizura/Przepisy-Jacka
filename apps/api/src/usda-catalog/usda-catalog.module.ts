import { Module } from '@nestjs/common';

import { UsdaCatalogController } from './usda-catalog.controller';
import { UsdaCatalogService } from './usda-catalog.service';
import { UsdaCatalogSyncService } from './usda-catalog-sync.service';

@Module({
  controllers: [UsdaCatalogController],
  providers: [UsdaCatalogService, UsdaCatalogSyncService],
  exports: [UsdaCatalogService, UsdaCatalogSyncService],
})
export class UsdaCatalogModule {}
