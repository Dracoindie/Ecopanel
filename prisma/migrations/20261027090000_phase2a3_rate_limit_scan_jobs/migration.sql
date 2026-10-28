-- Phase 2A.3: shared rate-limit storage and durable CV scan jobs.

CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
CREATE INDEX "RateLimitBucket_scope_idx" ON "RateLimitBucket"("scope");

CREATE TABLE "CvScanJob" (
    "id" TEXT NOT NULL,
    "cvFileId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CvScanJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CvScanJob_cvFileId_key" ON "CvScanJob"("cvFileId");
CREATE INDEX "CvScanJob_status_availableAt_idx" ON "CvScanJob"("status", "availableAt");
CREATE INDEX "CvScanJob_leaseExpiresAt_idx" ON "CvScanJob"("leaseExpiresAt");
CREATE INDEX "CvScanJob_organizationId_status_idx" ON "CvScanJob"("organizationId", "status");

ALTER TABLE "CvScanJob"
ADD CONSTRAINT "CvScanJob_cvFileId_fkey"
FOREIGN KEY ("cvFileId") REFERENCES "CvFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
