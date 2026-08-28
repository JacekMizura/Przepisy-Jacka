import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { ShoppingModule } from '../shopping/shopping.module';
import { RecipeCategoryController } from './recipe-category.controller';
import { RecipeCategoryService } from './recipe-category.service';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';

@Module({
  imports: [ShoppingModule, MediaModule],
  controllers: [RecipeController, RecipeCategoryController],
  providers: [RecipeService, RecipeCategoryService],
  exports: [RecipeCategoryService],
})
export class RecipeModule {}
