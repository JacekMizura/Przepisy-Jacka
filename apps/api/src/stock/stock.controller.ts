import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import {
  CreateProductIntakeDto,
  ProductIntakeResultDto,
  ProductMatchQueryDto,
  ProductMatchResultDto,
} from './dto/product-intake.dto';
import {
  ProductNutritionDto,
  UpsertProductNutritionDto,
} from './dto/product-nutrition.dto';
import {
  ConfigureProductPurchaseDto,
  CreateProductDto,
  ProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import {
  CreatePurchaseOptionDto,
  PurchaseOptionDto,
  UpdatePurchaseOptionDto,
} from './dto/purchase-option.dto';
import {
  CreateStockItemDto,
  StockItemDto,
  UpdateStockItemDto,
} from './dto/stock-item.dto';
import {
  ConsumeStockCommitDto,
  ConsumeStockPreviewDto,
  ConsumeStockPreviewResultDto,
  ReverseConsumptionDto,
  StockConsumptionResultDto,
} from './dto/stock-consume.dto';
import { StockProductSummaryDto } from './dto/stock-summary.dto';
import { StockService } from './stock.service';

@ApiTags('stock')
@Controller('kitchens/:kitchenId')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('products')
  @ApiOperation({ summary: 'Katalog produktów kuchni' })
  @ApiQuery({
    name: 'archive',
    required: false,
    enum: ['active', 'archived', 'all'],
    description: 'Domyślnie active — bez zarchiwizowanych.',
  })
  @ApiOkResponse({ type: [ProductDto] })
  listProducts(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Query('archive') archive?: string,
  ): Promise<ProductDto[]> {
    const filter =
      archive === 'archived' || archive === 'all' || archive === 'active'
        ? archive
        : 'active';
    return this.stockService.listProducts(session.user.id, kitchenId, filter);
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

  @Get('products/match')
  @ApiOperation({
    summary:
      'Dopasowanie produktu po EAN/nazwie (bez automatycznego scalania podobnych nazw)',
  })
  @ApiOkResponse({ type: ProductMatchResultDto })
  matchProducts(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Query() query: ProductMatchQueryDto,
  ): Promise<ProductMatchResultDto> {
    return this.stockService.matchProducts(session.user.id, kitchenId, query);
  }

  @Post('product-intakes')
  @ApiOperation({
    summary:
      'Atomowe przyjęcie produktu (nowy lub istniejący) z opcjonalnym zapasem i nutrition',
  })
  @ApiOkResponse({ type: ProductIntakeResultDto })
  createProductIntake(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: CreateProductIntakeDto,
  ): Promise<ProductIntakeResultDto> {
    return this.stockService.createProductIntake(
      session.user.id,
      kitchenId,
      body,
    );
  }

  @Patch('products/:productId')
  @ApiOperation({
    summary:
      'Aktualizacja produktu (name, defaultUnit, ean, category, purchaseMode)',
  })
  @ApiOkResponse({ type: ProductDto })
  updateProduct(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: UpdateProductDto,
  ): Promise<ProductDto> {
    return this.stockService.updateProduct(
      session.user.id,
      kitchenId,
      productId,
      body,
    );
  }

  @Post('products/:productId/configure-purchase')
  @ApiOperation({
    summary:
      'Konfiguracja sposobu zakupu produktu (opakowania / dokładna ilość)',
  })
  @ApiOkResponse({ type: ProductDto })
  configureProductPurchase(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: ConfigureProductPurchaseDto,
  ): Promise<ProductDto> {
    return this.stockService.configureProductPurchase(
      session.user.id,
      kitchenId,
      productId,
      body,
    );
  }

  @Delete('products/:productId')
  @ApiOperation({
    summary:
      'Archiwizacja produktu (historia zostaje). ?permanent=true tylko dla nigdy nieużytego.',
  })
  @ApiQuery({ name: 'permanent', required: false, type: Boolean })
  @ApiOkResponse({ type: ProductDto })
  async deleteProduct(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('permanent') permanent?: string,
  ): Promise<ProductDto | { ok: true }> {
    const result = await this.stockService.deleteProduct(
      session.user.id,
      kitchenId,
      productId,
      { permanent: permanent === 'true' },
    );
    return result ?? { ok: true };
  }

  @Post('products/:productId/restore')
  @ApiOperation({ summary: 'Przywrócenie produktu z archiwum' })
  @ApiOkResponse({ type: ProductDto })
  restoreProduct(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductDto> {
    return this.stockService.restoreProduct(
      session.user.id,
      kitchenId,
      productId,
    );
  }

  @Get('products/:productId/nutrition')
  @ApiOperation({ summary: 'Wartości odżywcze produktu' })
  @ApiOkResponse({ type: ProductNutritionDto })
  getProductNutrition(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductNutritionDto | null> {
    return this.stockService.getProductNutrition(
      session.user.id,
      kitchenId,
      productId,
    );
  }

  @Put('products/:productId/nutrition')
  @ApiOperation({ summary: 'Zapis wartości odżywczych produktu' })
  @ApiOkResponse({ type: ProductNutritionDto })
  upsertProductNutrition(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: UpsertProductNutritionDto,
  ): Promise<ProductNutritionDto> {
    return this.stockService.upsertProductNutrition(
      session.user.id,
      kitchenId,
      productId,
      body,
    );
  }

  @Delete('products/:productId/nutrition')
  @ApiOperation({ summary: 'Usunięcie wartości odżywczych produktu' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { deleted: { type: 'boolean', example: true } },
    },
  })
  deleteProductNutrition(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<{ deleted: true }> {
    return this.stockService.deleteProductNutrition(
      session.user.id,
      kitchenId,
      productId,
    );
  }

  @Get('products/:productId/purchase-options')
  @ApiOperation({ summary: 'Opcje zakupu produktu' })
  @ApiOkResponse({ type: [PurchaseOptionDto] })
  listPurchaseOptions(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<PurchaseOptionDto[]> {
    return this.stockService.listPurchaseOptions(
      session.user.id,
      kitchenId,
      productId,
    );
  }

  @Post('products/:productId/purchase-options')
  @ApiOperation({ summary: 'Dodanie opcji zakupu' })
  @ApiOkResponse({ type: PurchaseOptionDto })
  createPurchaseOption(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: CreatePurchaseOptionDto,
  ): Promise<PurchaseOptionDto> {
    return this.stockService.createPurchaseOption(
      session.user.id,
      kitchenId,
      productId,
      body,
    );
  }

  @Patch('products/:productId/purchase-options/:optionId')
  @ApiOperation({ summary: 'Aktualizacja opcji zakupu' })
  @ApiOkResponse({ type: PurchaseOptionDto })
  updatePurchaseOption(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: UpdatePurchaseOptionDto,
  ): Promise<PurchaseOptionDto> {
    return this.stockService.updatePurchaseOption(
      session.user.id,
      kitchenId,
      productId,
      optionId,
      body,
    );
  }

  @Delete('products/:productId/purchase-options/:optionId')
  @ApiOperation({ summary: 'Usunięcie lub dezaktywacja opcji zakupu' })
  async deletePurchaseOption(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
  ): Promise<{ ok: true }> {
    await this.stockService.deletePurchaseOption(
      session.user.id,
      kitchenId,
      productId,
      optionId,
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

  @Get('stock-summary')
  @ApiOperation({
    summary: 'Zbiorczy widok zapasów pogrupowany po produkcie (z partiami)',
  })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'location', required: false, enum: StorageLocation })
  @ApiOkResponse({ type: [StockProductSummaryDto] })
  listStockSummary(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Query('productId') productId?: string,
    @Query('location') location?: StorageLocation,
  ): Promise<StockProductSummaryDto[]> {
    return this.stockService.listStockSummary(session.user.id, kitchenId, {
      productId,
      location,
    });
  }

  @Post('products/:productId/consume/preview')
  @ApiOperation({ summary: 'Podgląd zużycia zapasu (FIFO, bez zapisu)' })
  @ApiOkResponse({ type: ConsumeStockPreviewResultDto })
  previewConsume(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: ConsumeStockPreviewDto,
  ): Promise<ConsumeStockPreviewResultDto> {
    return this.stockService.previewConsumeStock(
      session.user.id,
      kitchenId,
      productId,
      body,
    );
  }

  @Post('products/:productId/consume')
  @ApiOperation({ summary: 'Zatwierdzenie zużycia zapasu (idempotentne)' })
  @ApiOkResponse({ type: StockConsumptionResultDto })
  commitConsume(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: ConsumeStockCommitDto,
  ): Promise<StockConsumptionResultDto> {
    return this.stockService.commitConsumeStock(
      session.user.id,
      kitchenId,
      productId,
      body,
    );
  }

  @Get('stock-consumptions')
  @ApiOperation({ summary: 'Historia zużyć zapasów w kuchni' })
  @ApiQuery({ name: 'productId', required: false })
  @ApiOkResponse({ type: [StockConsumptionResultDto] })
  listConsumptions(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Query('productId') productId?: string,
  ): Promise<StockConsumptionResultDto[]> {
    return this.stockService.listConsumptions(session.user.id, kitchenId, {
      productId,
    });
  }

  @Post('stock-consumptions/:consumptionId/reverse')
  @ApiOperation({ summary: 'Cofnięcie wcześniejszego zużycia' })
  @ApiOkResponse({ type: StockConsumptionResultDto })
  reverseConsumption(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('consumptionId', ParseUUIDPipe) consumptionId: string,
    @Body() body: ReverseConsumptionDto,
  ): Promise<StockConsumptionResultDto> {
    return this.stockService.reverseConsumption(
      session.user.id,
      kitchenId,
      consumptionId,
      body.idempotencyKey,
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
