import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { ShoppingModule } from '../shopping/shopping.module';
import { RecipeImportService } from './import/recipe-import.service';
import { RecipeCategoryController } from './recipe-category.controller';
import { RecipeCategoryService } from './recipe-category.service';
import { RecipeImportController } from './recipe-import.controller';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';

@Module({
  imports: [ShoppingModule, MediaModule],
  controllers: [
    RecipeImportController,
    RecipeController,
    RecipeCategoryController,
  ],
  providers: [RecipeService, RecipeCategoryService, RecipeImportService],
  exports: [RecipeCategoryService],
})
export class RecipeModule {}
