-- AlterEnum
ALTER TYPE "MediaPurpose" ADD VALUE IF NOT EXISTS 'purchase_receipt';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "receiptMediaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_receiptMediaId_key" ON "Purchase"("receiptMediaId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_receiptMediaId_fkey" FOREIGN KEY ("receiptMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
