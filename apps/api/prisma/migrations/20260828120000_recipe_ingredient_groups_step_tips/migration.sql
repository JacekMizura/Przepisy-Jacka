-- CreateTable
CREATE TABLE "RecipeIngredientGroup" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "RecipeIngredientGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RecipeIngredient" ADD COLUMN "groupId" TEXT;

-- AlterTable
ALTER TABLE "RecipeStep" ADD COLUMN "tip" TEXT;

-- CreateIndex
CREATE INDEX "RecipeIngredientGroup_recipeId_sortOrder_idx" ON "RecipeIngredientGroup"("recipeId", "sortOrder");

-- CreateIndex
CREATE INDEX "RecipeIngredient_groupId_idx" ON "RecipeIngredient"("groupId");

-- AddForeignKey
ALTER TABLE "RecipeIngredientGroup" ADD CONSTRAINT "RecipeIngredientGroup_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RecipeIngredientGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
