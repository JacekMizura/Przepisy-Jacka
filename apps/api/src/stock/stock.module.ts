import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [MediaModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
