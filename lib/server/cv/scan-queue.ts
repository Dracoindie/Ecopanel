import { Prisma, type PrismaClient } from "@prisma/client";
import { logWarn } from "@/lib/server/logger";
import {
  getCvScanner,
  getCvScannerTimeoutMs,
  type CvScanStatus,
  type CvScanner
} from "@/lib/server/cv/scanner";
import { scanCvFile, type CvScanResultSummary } from "@/lib/server/cv/scan-service";
import { getCvStorage, type PrivateCvStorage } from "@/lib/server/cv/storage";

export type CvScanJobStatus = "PENDING" | "RUNNING" | "RETRY" | "SUCCEEDED" | "FAILED";

export interface ClaimedCvScanJob {
  id: string;
  cvFileId: string;
  organizationId: string;
  attempts: number;
  maxAttempts: number;
}

export interface ScanQueueDependencies {
  prisma: PrismaClient;
  scanner?: CvScanner | null;
  storage?: PrivateCvStorage;
  now?: () => Date;
  leaseMs?: number;
  workerId?: string;
  maxAttempts?: number;
}

export interface ProcessedScanJob {
  jobId: string;
  cvFileId: string;
  attempts: number;
  outcome: "succeeded" | "retry" | "failed" | "collision";
  scanStatus: CvScanStatus | null;
  delayMs?: number;
  error?: string | null;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export function scanRetryDelayMs(attempts: number, random: () => number = Math.random) {
  const exponent = Math.max(0, Math.min(10, attempts - 1));
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent);
  const jitter = Math.floor(random() * 1_000);
  return Math.min(BACKOFF_MAX_MS, base + jitter);
}

export function defaultScanLeaseMs() {
  return Math.max(60_000, getCvScannerTimeoutMs() * 2 + 30_000);
}

function safeFailure(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, 240) : null;
}

export async function enqueueCvScanJob(
  prisma: PrismaClient,
  input: { cvFileId: string; organizationId: string; availableAt?: Date; maxAttempts?: number }
) {
  return prisma.cvScanJob.upsert({
    where: { cvFileId: input.cvFileId },
    create: {
      cvFileId: input.cvFileId,
      organizationId: input.organizationId,
      status: "PENDING",
      availableAt: input.availableAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
    },
    update: {}
  });
}

export async function enqueueMissingScanJobs(prisma: PrismaClient, limit = 200) {
  const candidates = await prisma.cvFile.findMany({
    where: {
      deletedAt: null,
      scanStatus: { in: ["PENDING", "SCAN_FAILED", "UNSCANNED"] },
      scanJob: null
    },
    orderBy: { uploadedAt: "asc" },
    take: Math.max(1, Math.min(1_000, Math.floor(limit))),
    select: { id: true, organizationId: true }
  });

  let created = 0;
  for (const candidate of candidates) {
    await enqueueCvScanJob(prisma, {
      cvFileId: candidate.id,
      organizationId: candidate.organizationId
    });
    created += 1;
  }
  return { scanned: candidates.length, enqueued: created };
}

export async function claimNextScanJob(
  prisma: PrismaClient,
  input: { workerId: string; leaseMs?: number; now?: Date }
): Promise<ClaimedCvScanJob | null> {
  const now = input.now ?? new Date();
  const leaseMs = Math.max(10_000, input.leaseMs ?? defaultScanLeaseMs());
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    cvFileId: string;
    organizationId: string;
    attempts: number;
    maxAttempts: number;
  }>>(Prisma.sql`
    WITH candidate AS (
      SELECT "id"
      FROM "CvScanJob"
      WHERE (
          "status" IN ('PENDING', 'RETRY')
          AND "availableAt" <= ${now}
        )
        OR (
          "status" = 'RUNNING'
          AND "leaseExpiresAt" IS NOT NULL
          AND "leaseExpiresAt" <= ${now}
        )
      ORDER BY "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "CvScanJob" AS job
    SET
      "status" = 'RUNNING',
      "leaseOwner" = ${input.workerId},
      "leaseExpiresAt" = ${leaseExpiresAt},
      "attempts" = job."attempts" + 1,
      "lastAttemptAt" = ${now},
      "updatedAt" = ${now}
    FROM candidate
    WHERE job."id" = candidate."id"
    RETURNING job."id", job."cvFileId", job."organizationId", job."attempts", job."maxAttempts"
  `);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    cvFileId: row.cvFileId,
    organizationId: row.organizationId,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts)
  };
}

async function finishClaimedJob(
  prisma: PrismaClient,
  job: ClaimedCvScanJob,
  workerId: string,
  now: Date,
  data: {
    status: CvScanJobStatus;
    lastError?: string | null;
    availableAt?: Date;
    completedAt?: Date | null;
  }
) {
  const updated = await prisma.cvScanJob.updateMany({
    where: { id: job.id, status: "RUNNING", leaseOwner: workerId },
    data: {
      status: data.status,
      lastError: data.lastError ?? null,
      availableAt: data.availableAt ?? now,
      completedAt: data.completedAt ?? null,
      leaseOwner: null,
      leaseExpiresAt: null
    }
  });
  return updated.count > 0;
}

function retryOrFail(
  job: ClaimedCvScanJob,
  error: string | null,
  now: Date,
  random?: () => number
) {
  if (job.attempts >= job.maxAttempts) {
    return { status: "FAILED" as const, error, completedAt: now };
  }
  const delayMs = scanRetryDelayMs(job.attempts, random);
  return { status: "RETRY" as const, error, availableAt: new Date(now.getTime() + delayMs), delayMs };
}

export async function processClaimedScanJob(
  job: ClaimedCvScanJob,
  dependencies: ScanQueueDependencies
): Promise<ProcessedScanJob> {
  const prisma = dependencies.prisma;
  const now = dependencies.now ?? (() => new Date());
  const workerId = dependencies.workerId ?? "worker";
  const startedAt = now();

  let result: CvScanResultSummary;
  try {
    result = await scanCvFile(job.cvFileId, {
      prisma,
      scanner: dependencies.scanner,
      storage: dependencies.storage ?? getCvStorage(),
      now,
      leaseMs: dependencies.leaseMs
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan worker failed.";
    const retry = retryOrFail(job, safeFailure(message) ?? "Scan worker failed.", now());
    const saved = await finishClaimedJob(prisma, job, workerId, now(), {
      status: retry.status,
      lastError: retry.error,
      availableAt: retry.availableAt,
      completedAt: retry.completedAt
    });
    return {
      jobId: job.id,
      cvFileId: job.cvFileId,
      attempts: job.attempts,
      outcome: saved ? (retry.status === "FAILED" ? "failed" : "retry") : "collision",
      scanStatus: null,
      delayMs: retry.delayMs,
      error: retry.error
    };
  }

  if (result.status === "CLEAN" || result.status === "INFECTED") {
    const saved = await finishClaimedJob(prisma, job, workerId, now(), {
      status: "SUCCEEDED",
      completedAt: now()
    });
    return {
      jobId: job.id,
      cvFileId: job.cvFileId,
      attempts: job.attempts,
      outcome: saved ? "succeeded" : "collision",
      scanStatus: result.status,
      error: null
    };
  }

  let error: string;
  if (result.outcome === "not_found") error = "CV record no longer exists.";
  else if (result.outcome === "disabled") error = "No malware scanner is configured.";
  else if (result.outcome === "conflict") error = "Another scan attempt owns this CV.";
  else if (result.outcome === "skipped" && result.status === "PENDING") error = "CV scan is still leased by another attempt.";
  else error = safeFailure(result.detail) ?? "Malware scan did not complete.";

  const retry = retryOrFail(job, error, now());
  const saved = await finishClaimedJob(prisma, job, workerId, now(), {
    status: retry.status,
    lastError: retry.error,
    availableAt: retry.availableAt,
    completedAt: retry.completedAt
  });

  if (!saved) {
    logWarn("CV scan job finalization skipped because another worker owns it.", {
      jobId: job.id,
      cvFileId: job.cvFileId,
      workerId
    });
  }

  return {
    jobId: job.id,
    cvFileId: job.cvFileId,
    attempts: job.attempts,
    outcome: saved ? (retry.status === "FAILED" ? "failed" : "retry") : "collision",
    scanStatus: result.status,
    delayMs: retry.delayMs,
    error: retry.error
  };
}

export async function runScanWorkerOnce(dependencies: ScanQueueDependencies) {
  const workerId = dependencies.workerId ?? "worker";
  const job = await claimNextScanJob(dependencies.prisma, {
    workerId,
    leaseMs: dependencies.leaseMs,
    now: dependencies.now?.()
  });
  if (!job) return null;
  return processClaimedScanJob(job, dependencies);
}

export async function countScanJobs(prisma: PrismaClient) {
  const groups = await prisma.cvScanJob.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(groups.map(group => [group.status, group._count._all]));
}

export async function requeueFailedScanJobs(prisma: PrismaClient, limit = 100) {
  const failed = await prisma.cvScanJob.findMany({
    where: { status: "FAILED" },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(1_000, Math.floor(limit))),
    select: { id: true }
  });
  if (failed.length === 0) return { requeued: 0 };
  const result = await prisma.cvScanJob.updateMany({
    where: { id: { in: failed.map(job => job.id) }, status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      availableAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      completedAt: null
    }
  });
  return { requeued: result.count };
}

export function configuredScannerOrNull() {
  try {
    return getCvScanner();
  } catch {
    return null;
  }
}
