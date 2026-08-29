-- AlterEnum
CREATE TYPE "StockConsumptionKind" AS ENUM ('consume', 'write_off');

-- AlterTable
ALTER TABLE "StockConsumption"
ADD COLUMN "kind" "StockConsumptionKind" NOT NULL DEFAULT 'consume',
ADD COLUMN "reason" TEXT;
