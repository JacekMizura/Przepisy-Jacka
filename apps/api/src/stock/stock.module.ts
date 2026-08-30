import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { ProductGroupService } from './product-group.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [MediaModule],
  controllers: [StockController],
  providers: [StockService, ProductGroupService],
})
export class StockModule {}
