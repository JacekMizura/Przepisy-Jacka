-- CreateEnum
CREATE TYPE "RecipeVisibility" AS ENUM ('private', 'kitchen');

-- CreateEnum
CREATE TYPE "RecipeDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "RecipeIngredientUnit" AS ENUM ('piece', 'gram', 'kilogram', 'milliliter', 'liter', 'teaspoon', 'tablespoon', 'cup', 'pinch', 'package', 'to_taste');

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "servings" INTEGER NOT NULL,
    "prepTimeMinutes" INTEGER,
    "cookTimeMinutes" INTEGER,
    "difficulty" "RecipeDifficulty" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "RecipeVisibility" NOT NULL DEFAULT 'private',
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "unit" "RecipeIngredientUnit" NOT NULL,
    "note" TEXT,
    "productId" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeStep" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "RecipeStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeGapAddition" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "servings" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeGapAddition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recipe_kitchenId_idx" ON "Recipe"("kitchenId");

-- CreateIndex
CREATE INDEX "Recipe_kitchenId_authorUserId_idx" ON "Recipe"("kitchenId", "authorUserId");

-- CreateIndex
CREATE INDEX "Recipe_kitchenId_visibility_idx" ON "Recipe"("kitchenId", "visibility");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_sortOrder_idx" ON "RecipeIngredient"("recipeId", "sortOrder");

-- CreateIndex
CREATE INDEX "RecipeStep_recipeId_sortOrder_idx" ON "RecipeStep"("recipeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeGapAddition_idempotencyKey_key" ON "RecipeGapAddition"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RecipeGapAddition_recipeId_idx" ON "RecipeGapAddition"("recipeId");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeStep" ADD CONSTRAINT "RecipeStep_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeGapAddition" ADD CONSTRAINT "RecipeGapAddition_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeGapAddition" ADD CONSTRAINT "RecipeGapAddition_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
