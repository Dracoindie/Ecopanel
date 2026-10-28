-- DropIndex
DROP INDEX "EmailMessage_status_idx";

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "externalHtmlLink" TEXT,
ADD COLUMN     "externalStatus" TEXT,
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "leaseOwner" TEXT,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "notificationPolicy" TEXT NOT NULL DEFAULT 'None',
ADD COLUMN     "notificationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "operation" TEXT NOT NULL DEFAULT 'Upsert',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "provider" SET DEFAULT 'google';

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "providerAccountId" TEXT,
    "accountEmail" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL DEFAULT '',
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "status" TEXT NOT NULL DEFAULT 'Connected',
    "connectedByUserId" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastRefreshedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarOAuthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "redirectUri" TEXT NOT NULL,
    "codeVerifierEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_organizationId_key" ON "CalendarConnection"("organizationId");

-- CreateIndex
CREATE INDEX "CalendarConnection_provider_status_idx" ON "CalendarConnection"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarOAuthState_stateHash_key" ON "CalendarOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "CalendarOAuthState_expiresAt_idx" ON "CalendarOAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "CalendarOAuthState_organizationId_createdAt_idx" ON "CalendarOAuthState"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_connectionId_idx" ON "CalendarEvent"("connectionId");

-- CreateIndex
CREATE INDEX "CalendarEvent_status_availableAt_idx" ON "CalendarEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_leaseExpiresAt_idx" ON "CalendarEvent"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_organizationId_status_idx" ON "CalendarEvent"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_interviewId_provider_key" ON "CalendarEvent"("interviewId", "provider");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarOAuthState" ADD CONSTRAINT "CalendarOAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarOAuthState" ADD CONSTRAINT "CalendarOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
