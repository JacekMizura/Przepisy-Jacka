import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { StorageLocation } from '../generated/prisma/client';
import { CreateProductDto, ProductDto } from './dto/product.dto';
import {
  CreateStockItemDto,
  StockItemDto,
  UpdateStockItemDto,
} from './dto/stock-item.dto';
import { StockService } from './stock.service';

@ApiTags('stock')
@Controller('kitchens/:kitchenId')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('products')
  @ApiOperation({ summary: 'Katalog produktów kuchni' })
  @ApiOkResponse({ type: [ProductDto] })
  listProducts(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
  ): Promise<ProductDto[]> {
    return this.stockService.listProducts(session.user.id, kitchenId);
  }

  @Post('products')
  @ApiOperation({ summary: 'Dodanie produktu do katalogu' })
  @ApiOkResponse({ type: ProductDto })
  createProduct(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: CreateProductDto,
  ): Promise<ProductDto> {
    return this.stockService.createProduct(session.user.id, kitchenId, body);
  }

  @Delete('products/:productId')
  @ApiOperation({
    summary: 'Usunięcie produktu (kaskada partii po potwierdzeniu)',
  })
  @ApiQuery({ name: 'confirmCascade', required: false, type: Boolean })
  async deleteProduct(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('confirmCascade') confirmCascade?: string,
  ): Promise<{ ok: true }> {
    await this.stockService.deleteProduct(
      session.user.id,
      kitchenId,
      productId,
      confirmCascade === 'true',
    );
    return { ok: true };
  }

  @Get('stock-items')
  @ApiOperation({ summary: 'Partie zapasów' })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'location', required: false, enum: StorageLocation })
  @ApiOkResponse({ type: [StockItemDto] })
  listStock(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Query('productId') productId?: string,
    @Query('location') location?: StorageLocation,
  ): Promise<StockItemDto[]> {
    return this.stockService.listStockItems(session.user.id, kitchenId, {
      productId,
      location,
    });
  }

  @Post('stock-items')
  @ApiOperation({ summary: 'Dodanie partii zapasu' })
  @ApiOkResponse({ type: StockItemDto })
  createStock(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: CreateStockItemDto,
  ): Promise<StockItemDto> {
    return this.stockService.createStockItem(session.user.id, kitchenId, body);
  }

  @Patch('stock-items/:stockItemId')
  @ApiOperation({ summary: 'Aktualizacja partii zapasu' })
  @ApiOkResponse({ type: StockItemDto })
  updateStock(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('stockItemId', ParseUUIDPipe) stockItemId: string,
    @Body() body: UpdateStockItemDto,
  ): Promise<StockItemDto> {
    return this.stockService.updateStockItem(
      session.user.id,
      kitchenId,
      stockItemId,
      body,
    );
  }

  @Delete('stock-items/:stockItemId')
  @ApiOperation({ summary: 'Usunięcie partii zapasu' })
  async deleteStock(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('stockItemId', ParseUUIDPipe) stockItemId: string,
  ): Promise<{ ok: true }> {
    await this.stockService.deleteStockItem(
      session.user.id,
      kitchenId,
      stockItemId,
    );
    return { ok: true };
  }
}
