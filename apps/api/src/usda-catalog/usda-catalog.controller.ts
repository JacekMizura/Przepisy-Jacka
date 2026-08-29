import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import {
  UsdaCatalogEntryDetailDto,
  UsdaCatalogSearchQueryDto,
  UsdaCatalogSearchResponseDto,
  UsdaCatalogSuggestQueryDto,
  UsdaCatalogSuggestValuesDto,
} from './dto/usda-catalog.dto';
import { UsdaCatalogService } from './usda-catalog.service';

@ApiTags('usda-food-catalog')
@Controller('kitchens/:kitchenId/usda-foods')
export class UsdaCatalogController {
  constructor(private readonly usdaCatalogService: UsdaCatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Wyszukiwanie wspólnego katalogu żywności USDA (PL + aliasy)',
    description:
      'Katalog tylko do odczytu. Nie tworzy produktów w kuchni. Działa lokalnie bez połączenia z USDA.',
  })
  @ApiOkResponse({ type: UsdaCatalogSearchResponseDto })
  search(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Query() query: UsdaCatalogSearchQueryDto,
  ): Promise<UsdaCatalogSearchResponseDto> {
    return this.usdaCatalogService.search(
      session.user.id,
      kitchenId,
      query.q,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Get(':entryId')
  @ApiOperation({
    summary: 'Szczegóły wpisu katalogu USDA',
  })
  @ApiOkResponse({ type: UsdaCatalogEntryDetailDto })
  getById(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ): Promise<UsdaCatalogEntryDetailDto> {
    return this.usdaCatalogService.getById(session.user.id, kitchenId, entryId);
  }

  @Get(':entryId/suggest')
  @ApiOperation({
    summary:
      'Podgląd wartości odżywczych dopasowanych do jednostki produktu (bez zapisu)',
  })
  @ApiOkResponse({ type: UsdaCatalogSuggestValuesDto })
  suggest(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Query() query: UsdaCatalogSuggestQueryDto,
  ): Promise<UsdaCatalogSuggestValuesDto> {
    return this.usdaCatalogService.suggestForProductUnit(
      session.user.id,
      kitchenId,
      entryId,
      query.productUnit,
      query.pieceGrams,
    );
  }
}
