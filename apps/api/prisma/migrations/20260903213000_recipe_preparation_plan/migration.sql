-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "preparationPlanEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RecipeStep" ADD COLUMN "activeWorkMinutes" INTEGER,
ADD COLUMN "waitMinutes" INTEGER,
ADD COLUMN "timerEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecipeStepDependency" (
    "stepId" TEXT NOT NULL,
    "dependsOnStepId" TEXT NOT NULL,

    CONSTRAINT "RecipeStepDependency_pkey" PRIMARY KEY ("stepId","dependsOnStepId")
);

-- CreateIndex
CREATE INDEX "RecipeStepDependency_dependsOnStepId_idx" ON "RecipeStepDependency"("dependsOnStepId");

-- AddForeignKey
ALTER TABLE "RecipeStepDependency" ADD CONSTRAINT "RecipeStepDependency_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "RecipeStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeStepDependency" ADD CONSTRAINT "RecipeStepDependency_dependsOnStepId_fkey" FOREIGN KEY ("dependsOnStepId") REFERENCES "RecipeStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
