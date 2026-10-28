-- DropIndex
DROP INDEX "Assessment_interviewId_key";

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "model" TEXT,
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'Pending',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "rubricVersion" TEXT,
ADD COLUMN     "transcriptChecksum" TEXT,
ADD COLUMN     "transcriptId" TEXT,
ADD COLUMN     "transcriptVersion" INTEGER,
ADD COLUMN     "validation" JSONB;

-- CreateTable
CREATE TABLE "InterviewTranscript" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AGORA_CLIENT_FINAL',
    "checksum" TEXT NOT NULL,
    "turnCount" INTEGER NOT NULL,
    "turns" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "transcriptVersion" INTEGER NOT NULL,
    "transcriptChecksum" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "lastError" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "requestedByUserId" TEXT,
    "assessmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewTranscript_organizationId_interviewId_version_idx" ON "InterviewTranscript"("organizationId", "interviewId", "version");

-- CreateIndex
CREATE INDEX "InterviewTranscript_checksum_idx" ON "InterviewTranscript"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewTranscript_interviewId_version_key" ON "InterviewTranscript"("interviewId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentJob_dedupeKey_key" ON "AssessmentJob"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentJob_assessmentId_key" ON "AssessmentJob"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentJob_status_availableAt_idx" ON "AssessmentJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "AssessmentJob_leaseExpiresAt_idx" ON "AssessmentJob"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "AssessmentJob_organizationId_status_idx" ON "AssessmentJob"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AssessmentJob_interviewId_createdAt_idx" ON "AssessmentJob"("interviewId", "createdAt");

-- CreateIndex
CREATE INDEX "Assessment_interviewId_generatedAt_idx" ON "Assessment"("interviewId", "generatedAt");

-- CreateIndex
CREATE INDEX "Assessment_organizationId_generatedAt_idx" ON "Assessment"("organizationId", "generatedAt");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "InterviewTranscript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTranscript" ADD CONSTRAINT "InterviewTranscript_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTranscript" ADD CONSTRAINT "InterviewTranscript_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentJob" ADD CONSTRAINT "AssessmentJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentJob" ADD CONSTRAINT "AssessmentJob_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentJob" ADD CONSTRAINT "AssessmentJob_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "InterviewTranscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentJob" ADD CONSTRAINT "AssessmentJob_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
