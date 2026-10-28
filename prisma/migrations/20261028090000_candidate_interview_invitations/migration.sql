-- AlterTable
ALTER TABLE "LiveInterviewSession" ADD COLUMN     "candidateSessionId" TEXT,
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CandidateInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateInvitation_tokenHash_key" ON "CandidateInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "CandidateInvitation_organizationId_interviewId_idx" ON "CandidateInvitation"("organizationId", "interviewId");

-- CreateIndex
CREATE INDEX "CandidateInvitation_interviewId_revokedAt_redeemedAt_idx" ON "CandidateInvitation"("interviewId", "revokedAt", "redeemedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSession_tokenHash_key" ON "CandidateSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CandidateSession_interviewId_idx" ON "CandidateSession"("interviewId");

-- CreateIndex
CREATE INDEX "CandidateSession_invitationId_idx" ON "CandidateSession"("invitationId");

-- CreateIndex
CREATE INDEX "LiveInterviewSession_candidateSessionId_idx" ON "LiveInterviewSession"("candidateSessionId");

-- AddForeignKey
ALTER TABLE "LiveInterviewSession" ADD CONSTRAINT "LiveInterviewSession_candidateSessionId_fkey" FOREIGN KEY ("candidateSessionId") REFERENCES "CandidateSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInvitation" ADD CONSTRAINT "CandidateInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInvitation" ADD CONSTRAINT "CandidateInvitation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInvitation" ADD CONSTRAINT "CandidateInvitation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInvitation" ADD CONSTRAINT "CandidateInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSession" ADD CONSTRAINT "CandidateSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSession" ADD CONSTRAINT "CandidateSession_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSession" ADD CONSTRAINT "CandidateSession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSession" ADD CONSTRAINT "CandidateSession_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "CandidateInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

