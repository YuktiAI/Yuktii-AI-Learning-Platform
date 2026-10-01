-- AlterTable
ALTER TABLE "Stage" ADD COLUMN IF NOT EXISTS "gapDaysOverride" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StageProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOCKED',
    "scenarioUnlockedAt" TIMESTAMP(3),
    "submissionOpensAt" TIMESTAMP(3),
    "passedAt" TIMESTAMP(3),
    "bestScore" INTEGER,
    "implementationPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StageProgress_enrollmentId_idx" ON "StageProgress"("enrollmentId");
CREATE INDEX IF NOT EXISTS "StageProgress_stageId_idx" ON "StageProgress"("stageId");
CREATE INDEX IF NOT EXISTS "StageProgress_userId_idx" ON "StageProgress"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "StageProgress_enrollmentId_stageId_key" ON "StageProgress"("enrollmentId", "stageId");
CREATE UNIQUE INDEX IF NOT EXISTS "StageProgress_userId_stageId_key" ON "StageProgress"("userId", "stageId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'StageProgress_enrollmentId_fkey'
    ) THEN
        ALTER TABLE "StageProgress" ADD CONSTRAINT "StageProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'StageProgress_stageId_fkey'
    ) THEN
        ALTER TABLE "StageProgress" ADD CONSTRAINT "StageProgress_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
