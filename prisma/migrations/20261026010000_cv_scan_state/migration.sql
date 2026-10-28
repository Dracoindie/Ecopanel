-- Durable CV scan bookkeeping: attempts, leases, completion time.
ALTER TABLE "CvFile"
ADD COLUMN "scanAttemptId" TEXT,
ADD COLUMN "scanStartedAt" TIMESTAMP(3),
ADD COLUMN "scanCompletedAt" TIMESTAMP(3),
ADD COLUMN "scanAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "CvFile_scanStatus_scanStartedAt_idx" ON "CvFile"("scanStatus", "scanStartedAt");
