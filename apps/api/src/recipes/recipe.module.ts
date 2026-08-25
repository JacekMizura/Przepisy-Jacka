import { Module } from '@nestjs/common';

import { ShoppingModule } from '../shopping/shopping.module';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';

@Module({
  imports: [ShoppingModule],
  controllers: [RecipeController],
  providers: [RecipeService],
})
export class RecipeModule {}
