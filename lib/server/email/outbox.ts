import { Prisma, type PrismaClient } from "@prisma/client";
import { activeInvitationLink, INVITATION_LINK_PLACEHOLDER, publicInvitationBaseUrl } from "@/lib/server/candidate-access";
import { getEmailConfig } from "@/lib/server/email/config";
import type { EmailProvider } from "@/lib/server/email/provider";
import { logWarn } from "@/lib/server/logger";

export interface ClaimedEmailJob {
  id: string;
  organizationId: string;
  applicationId: string | null;
  interviewId?: string | null;
  attempts: number;
  maxAttempts: number;
  recipientEmail: string;
  subject: string;
  body: string;
  replyTo: string | null;
  idempotencyKey: string | null;
}

export interface EmailWorkerDependencies {
  prisma: PrismaClient;
  provider: EmailProvider;
  workerId?: string;
  now?: () => Date;
  leaseMs?: number;
  random?: () => number;
}

export interface ProcessedEmailJob {
  messageId: string;
  attempts: number;
  outcome: "accepted" | "retry" | "failed" | "collision";
  providerMessageId?: string;
  failureCode?: string;
  delayMs?: number;
}

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 15 * 60_000;

export function emailRetryDelayMs(attempts: number, random: () => number = Math.random) {
  const exponent = Math.max(0, Math.min(10, attempts - 1));
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
  return Math.min(BACKOFF_MAX_MS, base + Math.floor(random() * 1_000));
}

function safeFailure(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240) || null;
}

export async function claimNextEmailJob(
  prisma: PrismaClient,
  input: { workerId: string; leaseMs?: number; now?: Date }
): Promise<ClaimedEmailJob | null> {
  const now = input.now ?? new Date();
  const leaseMs = Math.max(30_000, input.leaseMs ?? getEmailConfig().leaseMs);
  const lockedUntil = new Date(now.getTime() + leaseMs);
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    organizationId: string;
    applicationId: string | null;
    interviewId: string | null;
    attempts: number;
    maxAttempts: number;
    recipientEmail: string;
    subject: string;
    body: string;
    replyTo: string | null;
    idempotencyKey: string | null;
  }>>(Prisma.sql`
    WITH candidate AS (
      SELECT "id"
      FROM "EmailMessage"
      WHERE "status" = 'Queued'
        AND "availableAt" <= ${now}
        AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
      ORDER BY "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "EmailMessage" AS message
    SET
      "status" = 'Sending',
      "lockedBy" = ${input.workerId},
      "lockedUntil" = ${lockedUntil},
      "attempts" = message."attempts" + 1,
      "lastAttemptAt" = ${now},
      "updatedAt" = ${now}
    FROM candidate
    WHERE message."id" = candidate."id"
    RETURNING
      message."id",
      message."organizationId",
      message."applicationId",
      message."interviewId",
      message."attempts",
      message."maxAttempts",
      message."recipientEmail",
      message."subject",
      message."body",
      message."replyTo",
      message."idempotencyKey"
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    applicationId: row.applicationId,
    interviewId: row.interviewId,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts),
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    body: row.body,
    replyTo: row.replyTo,
    idempotencyKey: row.idempotencyKey
  };
}

async function finishClaimedJob(
  prisma: PrismaClient,
  job: ClaimedEmailJob,
  workerId: string,
  now: Date,
  data: {
    status: string;
    failureCode?: string | null;
    lastError?: string | null;
    availableAt?: Date;
    acceptedAt?: Date | null;
    failedAt?: Date | null;
    sentAt?: Date | null;
    providerMessageId?: string | null;
    providerName: string;
    providerMode: string;
    applicationEvent?: { organizationId: string; applicationId: string; label: string; detail: string };
  }
) {
  return prisma.$transaction(async tx => {
    const updated = await tx.emailMessage.updateMany({
      where: { id: job.id, status: "Sending", lockedBy: workerId },
      data: {
        status: data.status,
        failureCode: data.failureCode ?? null,
        lastError: data.lastError ?? null,
        availableAt: data.availableAt ?? now,
        acceptedAt: data.acceptedAt === undefined ? undefined : data.acceptedAt,
        failedAt: data.failedAt === undefined ? undefined : data.failedAt,
        sentAt: data.sentAt === undefined ? undefined : data.sentAt,
        providerMessageId: data.providerMessageId === undefined ? undefined : data.providerMessageId,
        providerName: data.providerName,
        providerMode: data.providerMode,
        lockedBy: null,
        lockedUntil: null
      }
    });
    if (updated.count === 0) return false;
    if (data.applicationEvent) {
      await tx.applicationEvent.create({
        data: {
          organizationId: data.applicationEvent.organizationId,
          applicationId: data.applicationEvent.applicationId,
          type: "email",
          label: data.applicationEvent.label,
          detail: data.applicationEvent.detail,
          actorLabel: "Email delivery worker"
        }
      });
    }
    return true;
  });
}

export async function processClaimedEmailJob(
  job: ClaimedEmailJob,
  dependencies: EmailWorkerDependencies
): Promise<ProcessedEmailJob> {
  const now = dependencies.now ?? (() => new Date());
  const workerId = dependencies.workerId ?? "worker";
  const provider = dependencies.provider;

  let result: Awaited<ReturnType<EmailProvider["send"]>>;
  // Candidate join links are never stored; render the active one at send time.
  let text = job.body;
  let linkFailure: { code: string; message: string } | null = null;
  if (text.includes(INVITATION_LINK_PLACEHOLDER)) {
    if (!publicInvitationBaseUrl()) {
      linkFailure = { code: "INVITATION_URL_NOT_PUBLIC", message: "NEXT_PUBLIC_APP_URL is not a public HTTPS address, so the interview link was not sent." };
    } else {
      const link = job.interviewId
        ? await activeInvitationLink(dependencies.prisma, { organizationId: job.organizationId, interviewId: job.interviewId })
        : null;
      if (link) text = text.split(INVITATION_LINK_PLACEHOLDER).join(link);
      else linkFailure = { code: "INVITATION_INACTIVE", message: "The interview invitation was revoked, redeemed or expired before sending." };
    }
  }
  try {
    result = linkFailure
      ? { outcome: "permanent", ...linkFailure }
      : await provider.send({
        messageId: job.id,
        idempotencyKey: job.idempotencyKey,
        to: job.recipientEmail,
        subject: job.subject,
        text,
        replyTo: job.replyTo
      });
  } catch (error) {
    result = {
      outcome: "ambiguous",
      code: "PROVIDER_EXCEPTION",
      message: error instanceof Error ? error.message : "Provider call failed unexpectedly."
    };
  }

  const finishedAt = now();
  if (result.outcome === "accepted") {
    const saved = await finishClaimedJob(dependencies.prisma, job, workerId, finishedAt, {
      status: "Sent",
      sentAt: finishedAt,
      acceptedAt: finishedAt,
      providerMessageId: result.providerMessageId,
      providerName: provider.name,
      providerMode: provider.mode,
      applicationEvent: job.applicationId
        ? {
            organizationId: job.organizationId,
            applicationId: job.applicationId,
            label: "Email accepted by provider",
            detail: "The provider accepted the message. Delivery still requires a verified provider webhook."
          }
        : undefined
    });
    return {
      messageId: job.id,
      attempts: job.attempts,
      outcome: saved ? "accepted" : "collision",
      providerMessageId: result.providerMessageId
    };
  }

  if (result.outcome === "retryable" && job.attempts < job.maxAttempts) {
    const delayMs = Math.max(result.retryAfterMs ?? 0, emailRetryDelayMs(job.attempts, dependencies.random));
    const saved = await finishClaimedJob(dependencies.prisma, job, workerId, finishedAt, {
      status: "Queued",
      failureCode: result.code,
      lastError: safeFailure(result.message),
      availableAt: new Date(finishedAt.getTime() + delayMs),
      providerName: provider.name,
      providerMode: provider.mode
    });
    return {
      messageId: job.id,
      attempts: job.attempts,
      outcome: saved ? "retry" : "collision",
      failureCode: result.code,
      delayMs
    };
  }

  const ambiguous = result.outcome === "ambiguous";
  const failureCode = ambiguous ? "AMBIGUOUS_SEND" : result.code;
  const lastError = ambiguous
    ? "The provider response was not recorded safely. Automatic retry is disabled to avoid a duplicate email. Verify the provider dashboard before attempting a manual resend."
    : safeFailure(result.message);
  const saved = await finishClaimedJob(dependencies.prisma, job, workerId, finishedAt, {
    status: "Failed",
    failureCode,
    lastError,
    failedAt: finishedAt,
    providerName: provider.name,
    providerMode: provider.mode,
    applicationEvent: job.applicationId
      ? {
          organizationId: job.organizationId,
          applicationId: job.applicationId,
          label: ambiguous ? "Email delivery outcome unknown" : "Email delivery failed",
          detail: ambiguous
            ? "The provider did not return a safe result. The message was not retried automatically."
            : "The provider rejected the message or retries were exhausted."
        }
      : undefined
  });
  if (!saved) {
    logWarn("Email job finalization skipped because another worker owns it.", {
      messageId: job.id,
      workerId
    });
  }
  return {
    messageId: job.id,
    attempts: job.attempts,
    outcome: saved ? "failed" : "collision",
    failureCode
  };
}

export async function runEmailWorkerOnce(dependencies: EmailWorkerDependencies) {
  const workerId = dependencies.workerId ?? "worker";
  const job = await claimNextEmailJob(dependencies.prisma, {
    workerId,
    leaseMs: dependencies.leaseMs,
    now: dependencies.now?.()
  });
  if (!job) return null;
  return processClaimedEmailJob(job, { ...dependencies, workerId });
}

export async function recoverExpiredEmailSending(prisma: PrismaClient, now = new Date()) {
  const expired = await prisma.emailMessage.findMany({
    where: {
      status: "Sending",
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }]
    },
    select: { id: true, organizationId: true, applicationId: true },
    take: 100
  });
  if (!expired.length) return { recovered: 0 };
  const result = await prisma.$transaction(async tx => {
    await tx.emailMessage.updateMany({
      where: { id: { in: expired.map(item => item.id) }, status: "Sending" },
      data: {
        status: "Failed",
        failureCode: "AMBIGUOUS_SEND",
        lastError: "The worker stopped before recording the provider response. Automatic retry is disabled to avoid a duplicate email.",
        failedAt: now,
        lockedBy: null,
        lockedUntil: null
      }
    });
    const applicationEvents = expired
      .filter(item => item.applicationId)
      .map(item => ({
        organizationId: item.organizationId,
        applicationId: item.applicationId!,
        type: "email",
        label: "Email delivery outcome unknown",
        detail: "A worker lease expired while sending. The message was not retried automatically.",
        actorLabel: "Email delivery worker"
      }));
    if (applicationEvents.length) await tx.applicationEvent.createMany({ data: applicationEvents });
    return expired.length;
  });
  return { recovered: result };
}

export async function countEmailJobs(prisma: PrismaClient) {
  const groups = await prisma.emailMessage.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(groups.map(group => [group.status, group._count._all]));
}

export async function requeueFailedEmail(
  prisma: PrismaClient,
  input: { organizationId: string; messageId: string; actorUserId: string; actorLabel: string }
) {
  const message = await prisma.emailMessage.findFirst({
    where: { id: input.messageId, organizationId: input.organizationId }
  });
  if (!message) return { outcome: "not_found" as const };
  if (message.status !== "Failed") return { outcome: "not_failed" as const };
  if (message.failureCode === "AMBIGUOUS_SEND" || message.providerMessageId) {
    return { outcome: "ambiguous" as const };
  }
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.emailMessage.updateMany({
      where: { id: message.id, status: "Failed" },
      data: {
        status: "Queued",
        attempts: 0,
        availableAt: new Date(),
        failureCode: null,
        lastError: null,
        failedAt: null,
        lockedBy: null,
        lockedUntil: null
      }
    });
    if (result.count === 0) return false;
    if (message.applicationId) {
      await tx.applicationEvent.create({
        data: {
          organizationId: input.organizationId,
          applicationId: message.applicationId,
          type: "email",
          label: "Email requeued",
          detail: `"${message.subject}" was manually requeued after a definite provider failure.`,
          actorUserId: input.actorUserId,
          actorLabel: input.actorLabel
        }
      });
    }
    return true;
  });
  return updated ? { outcome: "queued" as const } : { outcome: "not_failed" as const };
}
