-- CreateTable
CREATE TABLE "RecipeCategory" (
    "id" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeCategoryAssignment" (
    "recipeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "RecipeCategoryAssignment_pkey" PRIMARY KEY ("recipeId","categoryId")
);

-- CreateIndex
CREATE INDEX "RecipeCategory_kitchenId_sortOrder_idx" ON "RecipeCategory"("kitchenId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeCategory_kitchenId_normalizedName_key" ON "RecipeCategory"("kitchenId", "normalizedName");

-- CreateIndex
CREATE INDEX "RecipeCategoryAssignment_categoryId_idx" ON "RecipeCategoryAssignment"("categoryId");

-- AddForeignKey
ALTER TABLE "RecipeCategory" ADD CONSTRAINT "RecipeCategory_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeCategoryAssignment" ADD CONSTRAINT "RecipeCategoryAssignment_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeCategoryAssignment" ADD CONSTRAINT "RecipeCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RecipeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default categories for existing kitchens (no recipe assignments).
INSERT INTO "RecipeCategory" ("id", "kitchenId", "name", "normalizedName", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  k."id",
  seed."name",
  seed."normalizedName",
  seed."sortOrder",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Kitchen" k
CROSS JOIN (
  VALUES
    ('Śniadania', 'śniadania', 0),
    ('Dania główne', 'dania główne', 1),
    ('Zupy', 'zupy', 2),
    ('Sałatki', 'sałatki', 3),
    ('Desery', 'desery', 4),
    ('Wypieki', 'wypieki', 5),
    ('Sosy', 'sosy', 6),
    ('Przetwory', 'przetwory', 7)
) AS seed("name", "normalizedName", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1
  FROM "RecipeCategory" existing
  WHERE existing."kitchenId" = k."id"
    AND existing."normalizedName" = seed."normalizedName"
);
