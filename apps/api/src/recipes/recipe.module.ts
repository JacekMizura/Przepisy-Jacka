import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { ShoppingModule } from '../shopping/shopping.module';
import { RecipeController } from './recipe.controller';
import { RecipeService } from './recipe.service';

@Module({
  imports: [ShoppingModule, MediaModule],
  controllers: [RecipeController],
  providers: [RecipeService],
})
export class RecipeModule {}
