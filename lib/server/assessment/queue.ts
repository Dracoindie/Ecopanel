import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getAssessmentConfig } from "@/lib/server/assessment/config";
import { ASSESSMENT_PROMPT_VERSION, ASSESSMENT_RUBRIC_VERSION } from "@/lib/server/assessment/rubric";
import {
  AssessmentServiceError,
  type AssessmentJobStatus,
  type StoredTranscriptTurn
} from "@/lib/server/assessment/types";
import { parseStoredTurns, transcriptChecksum } from "@/lib/server/assessment/transcript";
import { getPrisma } from "@/lib/server/db";

const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60_000;

function dedupeKey(interviewId: string, checksum: string, rubricVersion: string) {
  return createHash("sha256")
    .update(`${interviewId}:${checksum}:${rubricVersion}`)
    .digest("hex");
}

export function assessmentRetryDelayMs(attempts: number) {
  const exponent = Math.max(0, Math.min(10, attempts - 1));
  const base = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** exponent);
  return Math.min(RETRY_MAX_MS, base + Math.floor(Math.random() * 5_000));
}

interface EnqueueAssessmentInput {
  organizationId: string;
  interviewId: string;
  requestedByUserId?: string | null;
}

export async function enqueueAssessmentForInterview(
  tx: Prisma.TransactionClient,
  input: EnqueueAssessmentInput
) {
  const interview = await tx.interview.findFirst({
    where: {
      id: input.interviewId,
      organizationId: input.organizationId,
      status: "Completed"
    },
    include: {
      transcripts: { orderBy: { version: "desc" }, take: 1 },
      application: { include: { job: true } }
    }
  });
  if (!interview) return null;
  const transcript = interview.transcripts[0];
  if (!transcript) return null;

  const config = getAssessmentConfig();
  const key = dedupeKey(interview.id, transcript.checksum, ASSESSMENT_RUBRIC_VERSION);
  const existing = await tx.assessmentJob.findUnique({ where: { dedupeKey: key } });
  if (existing) {
    return { job: existing, transcript, created: false };
  }

  const job = await tx.assessmentJob.create({
    data: {
      organizationId: input.organizationId,
      applicationId: interview.applicationId,
      interviewId: interview.id,
      transcriptId: transcript.id,
      transcriptVersion: transcript.version,
      transcriptChecksum: transcript.checksum,
      rubricVersion: ASSESSMENT_RUBRIC_VERSION,
      promptVersion: ASSESSMENT_PROMPT_VERSION,
      dedupeKey: key,
      status: "Pending",
      maxAttempts: config.maxAttempts,
      provider: config.provider ?? config.providerRaw,
      model: config.model,
      requestedByUserId: input.requestedByUserId ?? null
    }
  });

  await tx.applicationEvent.create({
    data: {
      organizationId: input.organizationId,
      applicationId: interview.applicationId,
      type: "assessment",
      label: "Assessment queued",
      detail: "A durable assessment job was queued from the finalized interview transcript. It requires the assessment worker and provider configuration.",
      actorUserId: input.requestedByUserId ?? null,
      actorLabel: input.requestedByUserId ? "HR user" : "Assessment pipeline"
    }
  });

  return { job, transcript, created: true };
}

export async function queueAssessmentRetry(organizationId: string, interviewId: string, userId: string) {
  const prisma = getPrisma();
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, organizationId },
    include: {
      transcripts: { orderBy: { version: "desc" }, take: 1 }
    }
  });
  if (!interview) throw new AssessmentServiceError("Interview not found.", 404, "INTERVIEW_NOT_FOUND");
  if (interview.status !== "Completed") {
    throw new AssessmentServiceError("Complete the interview before generating an assessment.", 409, "INTERVIEW_NOT_COMPLETED");
  }
  const transcript = interview.transcripts[0];
  if (!transcript) {
    throw new AssessmentServiceError("Store a finalized interview transcript before generating an assessment.", 409, "TRANSCRIPT_REQUIRED");
  }

  const config = getAssessmentConfig();
  const key = dedupeKey(interview.id, transcript.checksum, ASSESSMENT_RUBRIC_VERSION);

  return prisma.$transaction(async tx => {
    const existing = await tx.assessmentJob.findUnique({ where: { dedupeKey: key } });
    if (existing?.status === "Completed") return { job: existing, created: false, retried: false };
    if (existing?.status === "Processing") {
      throw new AssessmentServiceError("The assessment is currently being generated.", 409, "ASSESSMENT_IN_PROGRESS");
    }
    if (existing) {
      const job = await tx.assessmentJob.update({
        where: { id: existing.id },
        data: {
          status: "Retrying",
          attempts: 0,
          maxAttempts: config.maxAttempts,
          availableAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          failureCode: null,
          lastError: null,
          completedAt: null,
          provider: config.provider ?? config.providerRaw,
          model: config.model,
          requestedByUserId: userId
        }
      });
      await tx.applicationEvent.create({
        data: {
          organizationId,
          applicationId: interview.applicationId,
          type: "assessment",
          label: "Assessment retry queued",
          detail: "An HR user requeued the assessment job. Human review remains required.",
          actorUserId: userId,
          actorLabel: "HR user"
        }
      });
      return { job, created: false, retried: true };
    }

    const created = await tx.assessmentJob.create({
      data: {
        organizationId,
        applicationId: interview.applicationId,
        interviewId: interview.id,
        transcriptId: transcript.id,
        transcriptVersion: transcript.version,
        transcriptChecksum: transcript.checksum,
        rubricVersion: ASSESSMENT_RUBRIC_VERSION,
        promptVersion: ASSESSMENT_PROMPT_VERSION,
        dedupeKey: key,
        status: "Pending",
        maxAttempts: config.maxAttempts,
        provider: config.provider ?? config.providerRaw,
        model: config.model,
        requestedByUserId: userId
      }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId,
        applicationId: interview.applicationId,
        type: "assessment",
        label: "Assessment queued",
        detail: "A durable assessment job was queued from the finalized interview transcript. Human review remains required.",
        actorUserId: userId,
        actorLabel: "HR user"
      }
    });
    return { job: created, created: true, retried: false };
  });
}

export interface ClaimedAssessmentJob {
  id: string;
  organizationId: string;
  applicationId: string;
  interviewId: string;
  transcriptId: string;
  transcriptVersion: number;
  transcriptChecksum: string;
  rubricVersion: string;
  promptVersion: string;
  attempts: number;
  maxAttempts: number;
  turns: StoredTranscriptTurn[];
  jobTitle: string;
  jobDescription: string;
  interviewRound: string;
}

async function recoverExpiredLeases(prisma: PrismaClient, now: Date) {
  const expired = await prisma.assessmentJob.findMany({
    where: {
      status: "Processing",
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }]
    },
    select: { id: true, attempts: true, maxAttempts: true },
    take: 100
  });
  for (const job of expired) {
    const exhausted = job.attempts >= job.maxAttempts;
    await prisma.assessmentJob.updateMany({
      where: { id: job.id, status: "Processing" },
      data: {
        status: exhausted ? "Failed" : "Retrying",
        failureCode: "ASSESSMENT_WORKER_INTERRUPTED",
        lastError: exhausted
          ? "Assessment generation was interrupted and retries were exhausted."
          : "Assessment generation was interrupted and will be retried.",
        availableAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: exhausted ? now : null
      }
    });
  }
}

export async function claimNextAssessmentJob(
  prisma: PrismaClient,
  input: { workerId: string; leaseMs?: number; now?: Date; jobId?: string }
) {
  const now = input.now ?? new Date();
  const leaseMs = Math.max(60_000, input.leaseMs ?? getAssessmentConfig().leaseMs);
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  await recoverExpiredLeases(prisma, now);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH candidate AS (
      SELECT "id"
      FROM "AssessmentJob"
      WHERE "status" IN ('Pending', 'Retrying')
        ${input.jobId ? Prisma.sql`AND "id" = ${input.jobId}` : Prisma.empty}
        AND "availableAt" <= ${now}
        AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${now})
        AND "attempts" < "maxAttempts"
      ORDER BY "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "AssessmentJob" AS job
    SET
      "status" = 'Processing',
      "leaseOwner" = ${input.workerId},
      "leaseExpiresAt" = ${leaseExpiresAt},
      "attempts" = job."attempts" + 1,
      "lastAttemptAt" = ${now},
      "startedAt" = COALESCE(job."startedAt", ${now}),
      "updatedAt" = ${now}
    FROM candidate
    WHERE job."id" = candidate."id"
    RETURNING job."id"
  `);
  const row = rows[0];
  if (!row) return null;

  const job = await prisma.assessmentJob.findUnique({
    where: { id: row.id },
    include: {
      transcript: true,
      interview: { include: { application: { include: { job: true } } } }
    }
  });
  if (!job) return null;
  return {
    id: job.id,
    organizationId: job.organizationId,
    applicationId: job.applicationId,
    interviewId: job.interviewId,
    transcriptId: job.transcriptId,
    transcriptVersion: job.transcriptVersion,
    transcriptChecksum: job.transcriptChecksum,
    rubricVersion: job.rubricVersion,
    promptVersion: job.promptVersion,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    turns: parseStoredTurns(job.transcript.turns),
    jobTitle: job.interview.application.job.title,
    jobDescription: job.interview.application.job.description,
    interviewRound: job.interview.round
  } satisfies ClaimedAssessmentJob;
}

export interface AssessmentWorkerResult {
  jobId: string;
  outcome: "completed" | "retry" | "failed" | "collision";
  status: AssessmentJobStatus;
  failureCode?: string;
  delayMs?: number;
  assessmentId?: string;
}

export async function markAssessmentRetry(
  prisma: PrismaClient,
  job: ClaimedAssessmentJob,
  workerId: string,
  input: { code: string; message: string; retryAfterMs?: number }
) {
  const now = new Date();
  const exhausted = job.attempts >= job.maxAttempts;
  const delayMs = Math.max(input.retryAfterMs ?? 0, assessmentRetryDelayMs(job.attempts));
  const status: AssessmentJobStatus = exhausted ? "Failed" : "Retrying";
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.assessmentJob.updateMany({
      where: { id: job.id, status: "Processing", leaseOwner: workerId },
      data: {
        status,
        availableAt: exhausted ? now : new Date(now.getTime() + delayMs),
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCode: input.code,
        lastError: input.message.slice(0, 1_000),
        completedAt: exhausted ? now : null
      }
    });
    if (updated.count === 0) return false;
    if (exhausted) {
      await tx.applicationEvent.create({
        data: {
          organizationId: job.organizationId,
          applicationId: job.applicationId,
          type: "assessment",
          label: "Assessment generation failed",
          detail: "The assessment job failed after bounded retries. No assessment was created and human review is still required.",
          actorLabel: "Assessment worker"
        }
      });
    }
    return true;
  });
  return {
    jobId: job.id,
    outcome: result ? (exhausted ? "failed" : "retry") : "collision",
    status,
    failureCode: input.code,
    delayMs: exhausted ? undefined : delayMs
  } satisfies AssessmentWorkerResult;
}

export async function markAssessmentFailed(
  prisma: PrismaClient,
  job: ClaimedAssessmentJob,
  workerId: string,
  input: { code: string; message: string }
) {
  const now = new Date();
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.assessmentJob.updateMany({
      where: { id: job.id, status: "Processing", leaseOwner: workerId },
      data: {
        status: "Failed",
        availableAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCode: input.code,
        lastError: input.message.slice(0, 1_000),
        completedAt: now
      }
    });
    if (updated.count === 0) return false;
    await tx.applicationEvent.create({
      data: {
        organizationId: job.organizationId,
        applicationId: job.applicationId,
        type: "assessment",
        label: "Assessment generation failed",
        detail: "No assessment was created because the provider output could not be verified. Human review is still required.",
        actorLabel: "Assessment worker"
      }
    });
    return true;
  });
  return {
    jobId: job.id,
    outcome: result ? "failed" : "collision",
    status: "Failed",
    failureCode: input.code
  } satisfies AssessmentWorkerResult;
}

export async function completeAssessment(
  prisma: PrismaClient,
  job: ClaimedAssessmentJob,
  workerId: string,
  assessment: {
    summary: string;
    dimensions: Prisma.InputJsonValue;
    strengths: Prisma.InputJsonValue;
    risks: Prisma.InputJsonValue;
    unresolvedConcerns: Prisma.InputJsonValue;
    overallScore: number;
    recommendation: string;
    provider: string;
    model: string;
    validation: Prisma.InputJsonValue;
  }
) {
  const now = new Date();
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.assessmentJob.updateMany({
      where: { id: job.id, status: "Processing", leaseOwner: workerId },
      data: {
        status: "Completed",
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCode: null,
        lastError: null,
        completedAt: now
      }
    });
    if (updated.count === 0) return null;

    const saved = await tx.assessment.create({
      data: {
        organizationId: job.organizationId,
        applicationId: job.applicationId,
        interviewId: job.interviewId,
        transcriptId: job.transcriptId,
        transcriptVersion: job.transcriptVersion,
        transcriptChecksum: job.transcriptChecksum,
        overallScore: assessment.overallScore,
        recommendation: assessment.recommendation,
        summary: assessment.summary,
        dimensions: assessment.dimensions,
        strengths: assessment.strengths,
        risks: assessment.risks,
        unresolvedConcerns: assessment.unresolvedConcerns,
        generatedAt: now,
        source: "AI",
        isDemo: false,
        provider: assessment.provider,
        model: assessment.model,
        rubricVersion: job.rubricVersion,
        promptVersion: job.promptVersion,
        reviewStatus: "Pending",
        validation: assessment.validation
      }
    });
    await tx.assessmentJob.update({
      where: { id: job.id },
      data: { assessmentId: saved.id }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: job.organizationId,
        applicationId: job.applicationId,
        type: "assessment",
        label: "AI-assisted assessment generated",
        detail: `Assessment ${saved.id} was generated from transcript version ${job.transcriptVersion}. Evidence validation passed; human review is required.`,
        actorLabel: "Assessment worker"
      }
    });
    return saved;
  });
  if (!result) {
    return {
      jobId: job.id,
      outcome: "collision",
      status: "Processing",
      failureCode: "ASSESSMENT_JOB_LEASE_LOST"
    } satisfies AssessmentWorkerResult;
  }
  return {
    jobId: job.id,
    outcome: "completed",
    status: "Completed",
    assessmentId: result.id
  } satisfies AssessmentWorkerResult;
}
