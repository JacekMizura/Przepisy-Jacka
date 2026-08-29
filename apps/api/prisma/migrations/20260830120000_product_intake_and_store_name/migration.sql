-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN "storeName" VARCHAR(120);

-- CreateTable
CREATE TABLE "ProductIntakeIdempotency" (
    "id" TEXT NOT NULL,
    "kitchenId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductIntakeIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductIntakeIdempotency_idempotencyKey_key" ON "ProductIntakeIdempotency"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductIntakeIdempotency_kitchenId_idx" ON "ProductIntakeIdempotency"("kitchenId");

-- AddForeignKey
ALTER TABLE "ProductIntakeIdempotency" ADD CONSTRAINT "ProductIntakeIdempotency_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
