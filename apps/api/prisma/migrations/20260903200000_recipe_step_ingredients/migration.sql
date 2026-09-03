-- CreateTable
CREATE TABLE "RecipeStepIngredient" (
    "recipeStepId" TEXT NOT NULL,
    "recipeIngredientId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeStepIngredient_pkey" PRIMARY KEY ("recipeStepId","recipeIngredientId")
);

-- CreateIndex
CREATE INDEX "RecipeStepIngredient_recipeIngredientId_idx" ON "RecipeStepIngredient"("recipeIngredientId");

-- AddForeignKey
ALTER TABLE "RecipeStepIngredient" ADD CONSTRAINT "RecipeStepIngredient_recipeStepId_fkey" FOREIGN KEY ("recipeStepId") REFERENCES "RecipeStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeStepIngredient" ADD CONSTRAINT "RecipeStepIngredient_recipeIngredientId_fkey" FOREIGN KEY ("recipeIngredientId") REFERENCES "RecipeIngredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
