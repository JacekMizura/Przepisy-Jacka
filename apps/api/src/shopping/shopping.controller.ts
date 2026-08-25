import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import {
  CheckoutPurchaseDto,
  PurchaseDetailDto,
  PurchaseSummaryDto,
} from './dto/purchase.dto';
import {
  CreateShoppingListItemDto,
  ShoppingListItemDto,
  UpdateShoppingListItemDto,
  UpdateShoppingListItemStatusDto,
} from './dto/shopping-list-item.dto';
import { ShoppingService } from './shopping.service';

@ApiTags('shopping')
@Controller('kitchens/:kitchenId')
export class ShoppingController {
  constructor(private readonly shoppingService: ShoppingService) {}

  @Get('shopping-list/items')
  @ApiOperation({ summary: 'Aktywne pozycje listy zakupów' })
  @ApiOkResponse({ type: [ShoppingListItemDto] })
  listShoppingListItems(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
  ): Promise<ShoppingListItemDto[]> {
    return this.shoppingService.listShoppingListItems(
      session.user.id,
      kitchenId,
    );
  }

  @Post('shopping-list/items')
  @ApiOperation({ summary: 'Dodanie pozycji do listy zakupów' })
  @ApiOkResponse({ type: ShoppingListItemDto })
  createShoppingListItem(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: CreateShoppingListItemDto,
  ): Promise<ShoppingListItemDto> {
    return this.shoppingService.createShoppingListItem(
      session.user.id,
      kitchenId,
      body,
    );
  }

  @Patch('shopping-list/items/:itemId')
  @ApiOperation({ summary: 'Aktualizacja pozycji listy zakupów' })
  @ApiOkResponse({ type: ShoppingListItemDto })
  updateShoppingListItem(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateShoppingListItemDto,
  ): Promise<ShoppingListItemDto> {
    return this.shoppingService.updateShoppingListItem(
      session.user.id,
      kitchenId,
      itemId,
      body,
    );
  }

  @Patch('shopping-list/items/:itemId/status')
  @ApiOperation({ summary: 'Zmiana statusu pozycji listy zakupów' })
  @ApiOkResponse({ type: ShoppingListItemDto })
  updateShoppingListItemStatus(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateShoppingListItemStatusDto,
  ): Promise<ShoppingListItemDto> {
    return this.shoppingService.updateShoppingListItemStatus(
      session.user.id,
      kitchenId,
      itemId,
      body.status,
    );
  }

  @Delete('shopping-list/items/:itemId')
  @ApiOperation({ summary: 'Usunięcie pozycji listy zakupów' })
  async deleteShoppingListItem(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<{ ok: true }> {
    await this.shoppingService.deleteShoppingListItem(
      session.user.id,
      kitchenId,
      itemId,
    );
    return { ok: true };
  }

  @Post('purchases/checkout')
  @ApiOperation({ summary: 'Rozliczenie zakupu z listy (idempotentne)' })
  @ApiOkResponse({ type: PurchaseDetailDto })
  checkoutPurchase(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Body() body: CheckoutPurchaseDto,
  ): Promise<PurchaseDetailDto> {
    return this.shoppingService.checkoutPurchase(
      session.user.id,
      kitchenId,
      body,
    );
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Lista zakupów (skrót)' })
  @ApiOkResponse({ type: [PurchaseSummaryDto] })
  listPurchases(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
  ): Promise<PurchaseSummaryDto[]> {
    return this.shoppingService.listPurchases(session.user.id, kitchenId);
  }

  @Get('purchases/:purchaseId')
  @ApiOperation({ summary: 'Szczegóły zakupu' })
  @ApiOkResponse({ type: PurchaseDetailDto })
  getPurchase(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
  ): Promise<PurchaseDetailDto> {
    return this.shoppingService.getPurchase(
      session.user.id,
      kitchenId,
      purchaseId,
    );
  }
}
