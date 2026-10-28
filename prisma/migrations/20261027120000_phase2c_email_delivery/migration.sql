-- Phase 2C: durable email delivery, provider lifecycle, and webhook events.

ALTER TABLE "EmailMessage"
ADD COLUMN "interviewId" TEXT,
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "providerName" TEXT,
ADD COLUMN "providerMode" TEXT,
ADD COLUMN "fromAddress" TEXT,
ADD COLUMN "replyTo" TEXT,
ADD COLUMN "lastError" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lockedBy" TEXT,
ADD COLUMN "lockedUntil" TIMESTAMP(3),
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "bouncedAt" TIMESTAMP(3),
ADD COLUMN "complainedAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "lastEventAt" TIMESTAMP(3);

UPDATE "EmailMessage" SET "status" = 'Queued' WHERE "status" = 'Pending';

CREATE TABLE "EmailDeliveryEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "EmailDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailDeliveryEvent_providerEventId_key" ON "EmailDeliveryEvent"("providerEventId");
CREATE INDEX "EmailDeliveryEvent_emailMessageId_occurredAt_idx" ON "EmailDeliveryEvent"("emailMessageId", "occurredAt");
CREATE INDEX "EmailDeliveryEvent_organizationId_receivedAt_idx" ON "EmailDeliveryEvent"("organizationId", "receivedAt");
CREATE INDEX "EmailMessage_interviewId_idx" ON "EmailMessage"("interviewId");
CREATE INDEX "EmailMessage_status_availableAt_idx" ON "EmailMessage"("status", "availableAt");
CREATE INDEX "EmailMessage_lockedUntil_idx" ON "EmailMessage"("lockedUntil");
CREATE INDEX "EmailMessage_providerMessageId_idx" ON "EmailMessage"("providerMessageId");
CREATE INDEX "EmailMessage_organizationId_kind_idx" ON "EmailMessage"("organizationId", "kind");

ALTER TABLE "EmailMessage"
ADD CONSTRAINT "EmailMessage_interviewId_fkey"
FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailDeliveryEvent"
ADD CONSTRAINT "EmailDeliveryEvent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDeliveryEvent"
ADD CONSTRAINT "EmailDeliveryEvent_emailMessageId_fkey"
FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
