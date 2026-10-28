import type { Prisma, PrismaClient } from "@prisma/client";
import { getAssessmentConfig } from "@/lib/server/assessment/config";
import { getAssessmentProvider } from "@/lib/server/assessment/provider";
import {
  claimNextAssessmentJob,
  completeAssessment,
  markAssessmentFailed,
  markAssessmentRetry,
  type AssessmentWorkerResult,
  type ClaimedAssessmentJob
} from "@/lib/server/assessment/queue";
import {
  AssessmentValidationError,
  type AssessmentProvider
} from "@/lib/server/assessment/types";
import { validateAssessmentOutput } from "@/lib/server/assessment/validation";
import { describeError, logInfo, logWarn } from "@/lib/server/logger";

function safeMessage(value: unknown) {
  if (value instanceof Error) return value.message.slice(0, 1_000);
  return String(value ?? "Assessment processing failed.").slice(0, 1_000);
}

export async function processClaimedAssessmentJob(
  prisma: PrismaClient,
  provider: AssessmentProvider | null,
  job: ClaimedAssessmentJob,
  workerId: string
): Promise<AssessmentWorkerResult> {
  if (!provider) {
    return markAssessmentRetry(prisma, job, workerId, {
      code: "ASSESSMENT_PROVIDER_UNCONFIGURED",
      message: "No assessment provider is configured. Configure the provider and retry the job."
    });
  }

  let result;
  try {
    result = await provider.generate({
      jobId: job.id,
      interviewId: job.interviewId,
      organizationId: job.organizationId,
      jobTitle: job.jobTitle,
      jobDescription: job.jobDescription,
      interviewRound: job.interviewRound,
      transcriptVersion: job.transcriptVersion,
      turns: job.turns
    });
  } catch (error) {
    logWarn("Assessment provider call threw", {
      jobId: job.id,
      attempt: job.attempts,
      error: describeError(error)
    });
    return markAssessmentRetry(prisma, job, workerId, {
      code: "ASSESSMENT_PROVIDER_UNAVAILABLE",
      message: `The assessment provider call failed: ${safeMessage(error)}`
    });
  }

  if (result.outcome === "retryable") {
    logWarn("Assessment provider requested retry", {
      jobId: job.id,
      attempt: job.attempts,
      code: result.code
    });
    return markAssessmentRetry(prisma, job, workerId, {
      code: result.code,
      message: result.message,
      retryAfterMs: result.retryAfterMs
    });
  }

  if (result.outcome === "permanent") {
    logWarn("Assessment provider returned a permanent failure", {
      jobId: job.id,
      attempt: job.attempts,
      code: result.code
    });
    return markAssessmentFailed(prisma, job, workerId, {
      code: result.code,
      message: result.message
    });
  }

  let validated;
  try {
    validated = validateAssessmentOutput(result.output, job.turns);
  } catch (error) {
    const code = error instanceof AssessmentValidationError ? error.code : "ASSESSMENT_VALIDATION_FAILED";
    logWarn("Assessment output failed evidence validation", {
      jobId: job.id,
      code,
      error: describeError(error)
    });
    return markAssessmentFailed(prisma, job, workerId, {
      code,
      message: error instanceof AssessmentValidationError
        ? error.message
        : "The assessment output could not be validated."
    });
  }

  const saved = await completeAssessment(prisma, job, workerId, {
    summary: validated.summary,
    dimensions: validated.dimensions as unknown as Prisma.InputJsonValue,
    strengths: validated.strengths as unknown as Prisma.InputJsonValue,
    risks: validated.risks as unknown as Prisma.InputJsonValue,
    unresolvedConcerns: validated.unresolvedConcerns as unknown as Prisma.InputJsonValue,
    overallScore: validated.overallScore,
    recommendation: validated.recommendation,
    provider: result.provider,
    model: result.model,
    validation: {
      passed: true,
      policy: "exact_candidate_turn_substring",
      rubricVersion: job.rubricVersion,
      promptVersion: job.promptVersion,
      evidenceItems: Object.values(validated.dimensions)
        .reduce((sum, dimension) => sum + dimension.evidenceItems.length, 0)
    } as Prisma.InputJsonValue
  });

  if (saved.outcome === "completed") {
    logInfo("AI-assisted assessment generated", {
      jobId: job.id,
      assessmentId: saved.assessmentId,
      transcriptVersion: job.transcriptVersion,
      attempt: job.attempts
    });
  } else {
    logWarn("Assessment job lease was lost before completion", { jobId: job.id });
  }

  return saved;
}

export async function processNextAssessmentJob(
  prisma: PrismaClient,
  input: { workerId: string; provider?: AssessmentProvider | null; leaseMs?: number }
) {
  const job = await claimNextAssessmentJob(prisma, {
    workerId: input.workerId,
    leaseMs: input.leaseMs
  });
  if (!job) return null;
  return processClaimedAssessmentJob(
    prisma,
    input.provider === undefined ? getAssessmentProvider() : input.provider,
    job,
    input.workerId
  );
}

export function assessmentWorkerId() {
  return process.env.ASSESSMENT_WORKER_ID?.trim()
    || `assessment-${process.pid}-${Date.now().toString(36)}`;
}

export function assessmentWorkerPollMs() {
  const parsed = Number(process.env.ASSESSMENT_WORKER_POLL_MS);
  return Number.isFinite(parsed) ? Math.max(500, Math.min(60_000, Math.floor(parsed))) : 2_000;
}

export async function assessmentWorkerHealth() {
  const config = getAssessmentConfig();
  return {
    ok: config.configured,
    worker: "assessment",
    providerMode: config.mode,
    providerConfigured: config.configured,
    configurationIssue: config.configurationIssue,
    pid: process.pid
  };
}
