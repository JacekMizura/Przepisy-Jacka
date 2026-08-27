import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { NutritionLookupResultDto } from './dto/nutrition-lookup.dto';
import { NutritionLookupService } from './nutrition-lookup.service';

@ApiTags('nutrition-lookup')
@Controller('kitchens/:kitchenId/nutrition-lookups')
export class NutritionLookupController {
  constructor(
    private readonly nutritionLookupService: NutritionLookupService,
  ) {}

  @Get('by-ean')
  @ApiOperation({
    summary: 'Pobranie wartości odżywczych produktu z Open Food Facts po EAN',
    description:
      'Integracja wyłącznie po stronie API. Nie wysyła danych użytkownika ani zdjęć. Wynik jest podglądem — zapis wymaga jawnego zatwierdzenia w formularzu produktu.',
  })
  @ApiQuery({ name: 'ean', required: true, example: '3017624010701' })
  @ApiOkResponse({ type: NutritionLookupResultDto })
  lookupByEan(
    @Session() session: UserSession,
    @Param('kitchenId', ParseUUIDPipe) kitchenId: string,
    @Query('ean') ean: string,
  ): Promise<NutritionLookupResultDto> {
    return this.nutritionLookupService.lookupByEan(
      session.user.id,
      kitchenId,
      ean ?? '',
    );
  }
}
