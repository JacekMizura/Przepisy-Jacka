-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "sourceAuthor" TEXT,
ADD COLUMN "importedAt" TIMESTAMP(3),
ADD COLUMN "importIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_importIdempotencyKey_key" ON "Recipe"("importIdempotencyKey");

-- CreateIndex
CREATE INDEX "Recipe_kitchenId_sourceUrl_idx" ON "Recipe"("kitchenId", "sourceUrl");
