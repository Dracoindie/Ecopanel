import { Prisma } from "@prisma/client";
import type {
  ApplicationStage,
  Candidate,
  Interview,
  InterviewStatus,
  Job
} from "@/lib/domain";
import { getAssessmentProviderStatus } from "@/lib/server/assessment/config";
import { enqueueAssessmentForInterview } from "@/lib/server/assessment/queue";
import type { AssessmentProviderStatus } from "@/lib/server/assessment/types";
import { getPrisma } from "@/lib/server/db";
import {
  calendarEventSummary,
  enqueueInterviewCalendarSync
} from "@/lib/server/calendar/service";
import {
  cancelQueuedInterviewEmails,
  enqueueHiringNotification,
  notificationActor
} from "@/lib/server/email/notifications";
import { toDomainCandidate } from "@/lib/server/recruitment/hr";
import { toDomainJob } from "@/lib/server/recruitment/jobs";
import type { HrContext } from "@/lib/server/session";
import { isValidTimeZone } from "@/lib/timezone";

export class HrInterviewError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "HrInterviewError";
  }
}

const DIMENSION_KEYS = ["technical", "product", "communication", "problemSolving", "adaptability"] as const;
const RECOMMENDATIONS = ["Strong Hire", "Hire", "Leaning Hire", "Needs Review"] as const;

type InterviewWithRelations = Prisma.InterviewGetPayload<{
  include: {
    application: { include: { candidate: true; job: true } };
    assessments: true;
    transcripts: true;
    assessmentJobs: true;
    calendarEvents: true;
  };
}>;

export interface HrAssessmentDimension {
  score: number | null;
  confidence: number;
  evidence: string[];
  sourceTurns: string[];
  evidenceItems: Array<{ turnId: string; quote: string }>;
  rationale: string;
  insufficientEvidence: boolean;
}

export interface HrAssessment {
  id: string;
  applicationId: string;
  interviewId: string;
  overallScore: number;
  recommendation: string;
  summary: string;
  dimensions: Record<string, HrAssessmentDimension>;
  strengths: string[];
  risks: string[];
  contradictions: string[];
  unresolvedConcerns: string[];
  generatedAt: string;
  source: string;
  isDemo: boolean;
  provider: string | null;
  model: string | null;
  rubricVersion: string | null;
  promptVersion: string | null;
  transcriptId: string | null;
  transcriptVersion: number | null;
  reviewStatus: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  aiGenerated: boolean;
}

export interface HrTranscript {
  id: string;
  version: number;
  source: string;
  turnCount: number;
  capturedAt: string;
}

export interface HrAssessmentJob {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  failureCode: string | null;
  lastError: string | null;
  transcriptVersion: number;
  rubricVersion: string;
  promptVersion: string;
  provider: string | null;
  model: string | null;
  availableAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  canRetry: boolean;
}

export interface HrInterviewDetail {
  interview: Interview;
  candidate: Candidate;
  job: Job;
  application: { id: string; stage: ApplicationStage; source: string };
  assessment: HrAssessment | null;
  transcript: HrTranscript | null;
  assessmentJob: HrAssessmentJob | null;
  assessmentProvider: AssessmentProviderStatus;
}

function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string") throw new HrInterviewError(`${label} is required.`, 400, "INVALID_INTERVIEW");
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HrInterviewError(`${label} must be between ${min} and ${max} characters.`, 400, "INVALID_INTERVIEW");
  }
  return normalized;
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new HrInterviewError(`${label} must be text.`, 400, "INVALID_INTERVIEW");
  const normalized = value.trim();
  if (normalized.length > max) throw new HrInterviewError(`${label} is too long.`, 400, "INVALID_INTERVIEW");
  return normalized;
}

/** Tolerance for clock skew and form latency when rejecting past interview times. */
const PAST_SCHEDULE_TOLERANCE_MS = 60_000;

function parseScheduleInput(input: unknown, requireApplication: boolean, now = new Date()) {
  if (!input || typeof input !== "object") throw new HrInterviewError("Send an interview payload.", 400, "INVALID_INTERVIEW");
  const raw = input as Record<string, unknown>;
  const scheduledAtRaw = text(raw.scheduledAt, "Interview date", 10, 40);
  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) throw new HrInterviewError("Choose a valid interview date.", 400, "INVALID_INTERVIEW");
  if (scheduledAt.getTime() < now.getTime() - PAST_SCHEDULE_TOLERANCE_MS) {
    throw new HrInterviewError("That time has already passed. Choose a future date and time for the interview.", 400, "INTERVIEW_IN_PAST");
  }
  const durationMinutes = Number(raw.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 240) {
    throw new HrInterviewError("Interview duration must be between 10 and 240 minutes.", 400, "INVALID_INTERVIEW");
  }
  const timezone = text(raw.timezone, "Time zone", 1, 80);
  if (!isValidTimeZone(timezone)) {
    throw new HrInterviewError("Choose a valid IANA time zone.", 400, "INVALID_INTERVIEW");
  }
  return {
    applicationId: requireApplication ? text(raw.applicationId, "Application", 1, 120) : "",
    scheduledAt,
    durationMinutes,
    timezone,
    round: text(raw.round, "Interview round", 2, 100),
    notes: optionalText(raw.notes, "Notes", 4000),
    notify: raw.notify === true,
    calendarNotify: raw.calendarNotify === true
  };
}

function toDomainInterview(interview: InterviewWithRelations): Interview {
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    candidateId: interview.application.candidateId,
    jobId: interview.application.jobId,
    scheduledAt: interview.scheduledAt.toISOString(),
    durationMinutes: interview.durationMinutes,
    timezone: interview.timezone,
    round: interview.round,
    status: interview.status as InterviewStatus,
    assessmentId: interview.assessments[0]?.id,
    notes: interview.notes,
    calendarSync: interview.calendarEvents[0]
      ? calendarEventSummary(interview.calendarEvents[0])
      : null
  };
}

function stringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function assessmentDimensions(value: Prisma.JsonValue): Record<string, HrAssessmentDimension> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const dimensions: Record<string, HrAssessmentDimension> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const evidence = Array.isArray(item.evidence) ? item.evidence.map(String).filter(Boolean) : [];
    const sourceTurns = Array.isArray(item.sourceTurns) ? item.sourceTurns.map(String).filter(Boolean) : [];
    const evidenceItems = Array.isArray(item.evidenceItems)
      ? item.evidenceItems.flatMap(citation => {
        if (!citation || typeof citation !== "object" || Array.isArray(citation)) return [];
        const parsed = citation as Record<string, unknown>;
        if (typeof parsed.turnId !== "string" || typeof parsed.quote !== "string") return [];
        return [{ turnId: parsed.turnId, quote: parsed.quote }];
      })
      : [];
    const score = typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null;
    dimensions[key] = {
      score,
      confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence) ? item.confidence : 0,
      evidence,
      sourceTurns,
      evidenceItems,
      rationale: typeof item.rationale === "string" ? item.rationale : "",
      insufficientEvidence: item.insufficientEvidence === true || score === null
    };
  }
  return dimensions;
}

function toHrAssessment(assessment: InterviewWithRelations["assessments"][number]): HrAssessment {
  return {
    id: assessment.id,
    applicationId: assessment.applicationId,
    interviewId: assessment.interviewId ?? "",
    overallScore: assessment.overallScore,
    recommendation: assessment.recommendation,
    summary: assessment.summary,
    dimensions: assessmentDimensions(assessment.dimensions),
    strengths: stringArray(assessment.strengths),
    risks: stringArray(assessment.risks),
    contradictions: stringArray(assessment.unresolvedConcerns),
    unresolvedConcerns: stringArray(assessment.unresolvedConcerns),
    generatedAt: assessment.generatedAt.toISOString(),
    source: assessment.source,
    isDemo: assessment.isDemo,
    provider: assessment.provider,
    model: assessment.model,
    rubricVersion: assessment.rubricVersion,
    promptVersion: assessment.promptVersion,
    transcriptId: assessment.transcriptId,
    transcriptVersion: assessment.transcriptVersion,
    reviewStatus: assessment.reviewStatus,
    reviewedAt: assessment.reviewedAt?.toISOString() ?? null,
    reviewNote: assessment.reviewNote,
    aiGenerated: assessment.source === "AI" && !assessment.isDemo
  };
}

function toHrAssessmentJob(job: InterviewWithRelations["assessmentJobs"][number] | undefined): HrAssessmentJob | null {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    failureCode: job.failureCode,
    lastError: job.lastError,
    transcriptVersion: job.transcriptVersion,
    rubricVersion: job.rubricVersion,
    promptVersion: job.promptVersion,
    provider: job.provider,
    model: job.model,
    availableAt: job.availableAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    canRetry: job.status !== "Completed" && job.status !== "Processing"
  };
}

function toHrTranscript(transcript: InterviewWithRelations["transcripts"][number] | undefined): HrTranscript | null {
  if (!transcript) return null;
  return {
    id: transcript.id,
    version: transcript.version,
    source: transcript.source,
    turnCount: transcript.turnCount,
    capturedAt: transcript.capturedAt.toISOString()
  };
}

const includeRelations = {
  application: { include: { candidate: true, job: true } },
  assessments: { orderBy: { generatedAt: "desc" }, take: 1 },
  transcripts: { orderBy: { version: "desc" }, take: 1 },
  assessmentJobs: { orderBy: { createdAt: "desc" }, take: 1 },
  calendarEvents: {
    where: { provider: "google" },
    orderBy: { updatedAt: "desc" },
    take: 1
  }
} satisfies Prisma.InterviewInclude;

export async function listHrInterviews(organizationId: string) {
  const interviews = await getPrisma().interview.findMany({
    where: { organizationId },
    include: includeRelations,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }]
  });
  return interviews.map(toDomainInterview);
}

export async function listInterviewOptions(organizationId: string) {
  const applications = await getPrisma().application.findMany({
    where: { organizationId },
    include: { candidate: true, job: true },
    orderBy: { appliedAt: "desc" },
    take: 250
  });
  return applications.map(application => ({
    applicationId: application.id,
    stage: application.stage as ApplicationStage,
    candidate: {
      id: application.candidate.id,
      name: application.candidate.name,
      email: application.candidate.email
    },
    job: {
      id: application.job.id,
      title: application.job.title
    }
  }));
}

export async function getHrInterview(organizationId: string, id: string): Promise<HrInterviewDetail | null> {
  const interview = await getPrisma().interview.findFirst({
    where: { id, organizationId },
    include: includeRelations
  });
  if (!interview) return null;
  return {
    interview: toDomainInterview(interview),
    candidate: toDomainCandidate(interview.application.candidate),
    job: toDomainJob(interview.application.job),
    application: {
      id: interview.application.id,
      stage: interview.application.stage as ApplicationStage,
      source: interview.application.source
    },
    assessment: interview.assessments[0] ? toHrAssessment(interview.assessments[0]) : null,
    transcript: toHrTranscript(interview.transcripts[0]),
    assessmentJob: toHrAssessmentJob(interview.assessmentJobs[0]),
    assessmentProvider: getAssessmentProviderStatus()
  };
}

export async function createHrInterview(context: HrContext, raw: unknown): Promise<Interview> {
  const input = parseScheduleInput(raw, true);
  const application = await getPrisma().application.findFirst({
    where: { id: input.applicationId, organizationId: context.organization.id }
  });
  if (!application) throw new HrInterviewError("Application not found.", 404, "APPLICATION_NOT_FOUND");

  const interview = await getPrisma().$transaction(async tx => {
    const created = await tx.interview.create({
      data: {
        organizationId: context.organization.id,
        applicationId: application.id,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        timezone: input.timezone,
        round: input.round,
        notes: input.notes,
        status: "Scheduled"
      },
      include: includeRelations
    });
    if (application.stage !== "Selected" && application.stage !== "Rejected") {
      await tx.application.update({ where: { id: application.id }, data: { stage: "Interview" } });
    }
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId: application.id,
        type: "interview",
        label: "Interview scheduled",
        detail: `${input.round} scheduled for ${input.scheduledAt.toISOString()}.`,
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });
    if (input.notify) {
      await enqueueHiringNotification(tx, {
        organizationId: context.organization.id,
        applicationId: application.id,
        interviewId: created.id,
        kind: "interview_invite",
        scheduledAt: created.scheduledAt,
        timezone: created.timezone,
        ...notificationActor(context)
      });
      await enqueueHiringNotification(tx, {
        organizationId: context.organization.id,
        applicationId: application.id,
        interviewId: created.id,
        kind: "interview_reminder",
        scheduledAt: created.scheduledAt,
        timezone: created.timezone,
        ...notificationActor(context)
      });
    }
    await enqueueInterviewCalendarSync(tx, {
      organizationId: context.organization.id,
      interviewId: created.id,
      operation: "Upsert",
      notificationPolicy: input.calendarNotify ? "All" : "None"
    });
    return created;
  });
  return toDomainInterview(interview);
}

export async function updateHrInterview(context: HrContext, id: string, raw: unknown): Promise<Interview> {
  const input = parseScheduleInput(raw, false);
  const existing = await getPrisma().interview.findFirst({
    where: { id, organizationId: context.organization.id }
  });
  if (!existing) throw new HrInterviewError("Interview not found.", 404, "INTERVIEW_NOT_FOUND");
  if (existing.status !== "Scheduled") {
    throw new HrInterviewError("Only scheduled interviews can be rescheduled.", 409, "INTERVIEW_NOT_SCHEDULED");
  }

  const interview = await getPrisma().$transaction(async tx => {
    const updated = await tx.interview.update({
      where: { id },
      data: {
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        timezone: input.timezone,
        round: input.round,
        notes: input.notes
      },
      include: includeRelations
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId: existing.applicationId,
        type: "interview",
        label: "Interview rescheduled",
        detail: `Moved to ${input.scheduledAt.toISOString()}.`,
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });
    await cancelQueuedInterviewEmails(tx, {
      organizationId: context.organization.id,
      interviewId: id
    });
    if (input.notify) {
      await enqueueHiringNotification(tx, {
        organizationId: context.organization.id,
        applicationId: existing.applicationId,
        interviewId: id,
        kind: "interview_reschedule",
        scheduledAt: updated.scheduledAt,
        timezone: updated.timezone,
        notificationVersion: updated.updatedAt.getTime(),
        ...notificationActor(context)
      });
      await enqueueHiringNotification(tx, {
        organizationId: context.organization.id,
        applicationId: existing.applicationId,
        interviewId: id,
        kind: "interview_reminder",
        scheduledAt: updated.scheduledAt,
        timezone: updated.timezone,
        notificationVersion: updated.updatedAt.getTime(),
        ...notificationActor(context)
      });
    }
    await enqueueInterviewCalendarSync(tx, {
      organizationId: context.organization.id,
      interviewId: id,
      operation: "Upsert",
      notificationPolicy: input.calendarNotify ? "All" : "None"
    });
    return updated;
  });
  return toDomainInterview(interview);
}

export async function cancelHrInterview(
  context: HrContext,
  id: string,
  options: { notify?: boolean; calendarNotify?: boolean } = {}
): Promise<Interview> {
  const existing = await getPrisma().interview.findFirst({
    where: { id, organizationId: context.organization.id }
  });
  if (!existing) throw new HrInterviewError("Interview not found.", 404, "INTERVIEW_NOT_FOUND");
  if (existing.status === "Completed") {
    throw new HrInterviewError("Completed interviews cannot be cancelled.", 409, "INTERVIEW_COMPLETED");
  }
  if (existing.status === "Cancelled") {
    const current = await getHrInterview(context.organization.id, id);
    return current!.interview;
  }

  const interview = await getPrisma().$transaction(async tx => {
    const updated = await tx.interview.update({
      where: { id },
      data: { status: "Cancelled" },
      include: includeRelations
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId: existing.applicationId,
        type: "interview",
        label: "Interview cancelled",
        detail: "The scheduled interview was cancelled.",
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });
    await cancelQueuedInterviewEmails(tx, {
      organizationId: context.organization.id,
      interviewId: id
    });
    if (options.notify) {
      await enqueueHiringNotification(tx, {
        organizationId: context.organization.id,
        applicationId: existing.applicationId,
        interviewId: id,
        kind: "interview_cancel",
        scheduledAt: existing.scheduledAt,
        timezone: existing.timezone,
        ...notificationActor(context)
      });
    }
    await enqueueInterviewCalendarSync(tx, {
      organizationId: context.organization.id,
      interviewId: id,
      operation: "Cancel",
      notificationPolicy: options.calendarNotify ? "All" : "None"
    });
    return updated;
  });
  return toDomainInterview(interview);
}

export async function completeHrInterview(context: HrContext, id: string): Promise<Interview> {
  const existing = await getPrisma().interview.findFirst({
    where: { id, organizationId: context.organization.id }
  });
  if (!existing) throw new HrInterviewError("Interview not found.", 404, "INTERVIEW_NOT_FOUND");
  if (existing.status === "Cancelled") {
    throw new HrInterviewError("Cancelled interviews cannot be completed.", 409, "INTERVIEW_CANCELLED");
  }
  if (existing.status === "Completed") {
    const current = await getHrInterview(context.organization.id, id);
    return current!.interview;
  }

  const interview = await getPrisma().$transaction(async tx => {
    await tx.interview.update({
      where: { id },
      data: { status: "Completed" }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId: existing.applicationId,
        type: "interview",
        label: "Interview completed",
        detail: "The interview was marked complete. Assessment generation requires a finalized transcript.",
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });
    await enqueueAssessmentForInterview(tx, {
      organizationId: context.organization.id,
      interviewId: id,
      requestedByUserId: context.user.id
    });
    const updated = await tx.interview.findUniqueOrThrow({
      where: { id },
      include: includeRelations
    });
    return updated;
  });
  return toDomainInterview(interview);
}

function assessmentTextList(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new HrInterviewError(`${label} must be a list.`, 400, "INVALID_ASSESSMENT");
  const items = value.map(item => typeof item === "string" ? item.trim() : "").filter(Boolean);
  if (items.length > 30 || items.some(item => item.length > 1000)) {
    throw new HrInterviewError(`${label} contains an invalid item.`, 400, "INVALID_ASSESSMENT");
  }
  return items;
}

// Interfaces lack an index signature, so copy each field into an explicit JSON object.
function assessmentDimensionJson(dimension: HrAssessmentDimension): Prisma.InputJsonObject {
  return {
    score: dimension.score,
    evidence: dimension.evidence,
    sourceTurns: dimension.sourceTurns,
    evidenceItems: dimension.evidenceItems.map(item => ({ turnId: item.turnId, quote: item.quote })),
    rationale: dimension.rationale,
    insufficientEvidence: dimension.insufficientEvidence,
    confidence: dimension.confidence
  };
}

export async function saveHrAssessment(context: HrContext, interviewId: string, raw: unknown): Promise<HrAssessment> {
  const interview = await getPrisma().interview.findFirst({
    where: { id: interviewId, organizationId: context.organization.id }
  });
  if (!interview) throw new HrInterviewError("Interview not found.", 404, "INTERVIEW_NOT_FOUND");
  if (interview.status !== "Completed") {
    throw new HrInterviewError("Complete the interview before saving an assessment.", 409, "INTERVIEW_NOT_COMPLETED");
  }
  if (!raw || typeof raw !== "object") throw new HrInterviewError("Send an assessment payload.", 400, "INVALID_ASSESSMENT");
  const body = raw as Record<string, unknown>;
  const overallScore = Number(body.overallScore);
  if (!Number.isFinite(overallScore) || overallScore < 0 || overallScore > 10) {
    throw new HrInterviewError("Overall score must be between 0 and 10.", 400, "INVALID_ASSESSMENT");
  }
  const recommendation = String(body.recommendation ?? "");
  if (!RECOMMENDATIONS.includes(recommendation as (typeof RECOMMENDATIONS)[number])) {
    throw new HrInterviewError("Choose a valid recommendation.", 400, "INVALID_ASSESSMENT");
  }
  const summary = text(body.summary, "Summary", 20, 8000);
  const rawDimensions = body.dimensions;
  if (!rawDimensions || typeof rawDimensions !== "object") {
    throw new HrInterviewError("Assessment dimensions are required.", 400, "INVALID_ASSESSMENT");
  }
  const dimensions: Record<string, HrAssessmentDimension> = {};
  for (const key of DIMENSION_KEYS) {
    const dimension = (rawDimensions as Record<string, unknown>)[key];
    if (!dimension || typeof dimension !== "object") {
      throw new HrInterviewError(`Assessment dimension ${key} is required.`, 400, "INVALID_ASSESSMENT");
    }
    const item = dimension as Record<string, unknown>;
    const score = Number(item.score);
    const confidence = Number(item.confidence);
    if (!Number.isFinite(score) || score < 0 || score > 10 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new HrInterviewError(`Assessment dimension ${key} is invalid.`, 400, "INVALID_ASSESSMENT");
    }
    dimensions[key] = {
      score,
      evidence: assessmentTextList(item.evidence, "Evidence"),
      sourceTurns: assessmentTextList(item.sourceTurns, "Source turns"),
      evidenceItems: [],
      rationale: "",
      insufficientEvidence: false,
      confidence
    };
  }

  const data = {
    organizationId: context.organization.id,
    applicationId: interview.applicationId,
    overallScore,
    recommendation,
    summary,
    dimensions: Object.fromEntries(
      Object.entries(dimensions).map(([key, dimension]) => [key, assessmentDimensionJson(dimension)])
    ) satisfies Prisma.InputJsonObject,
    strengths: assessmentTextList(body.strengths ?? [], "Strengths") as Prisma.InputJsonValue,
    risks: assessmentTextList(body.risks ?? [], "Risks") as Prisma.InputJsonValue,
    unresolvedConcerns: assessmentTextList(body.unresolvedConcerns ?? [], "Unresolved concerns") as Prisma.InputJsonValue,
    source: optionalText(body.source, "Source", 40) || "LIVE",
    isDemo: false
  };

  const assessment = await getPrisma().$transaction(async tx => {
    const saved = await tx.assessment.create({
      data: { ...data, interviewId }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId: interview.applicationId,
        type: "assessment",
        label: "Interview report linked",
        detail: `Assessment ${saved.id} was linked to this interview.`,
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });
    return saved;
  });

  return {
    id: assessment.id,
    applicationId: assessment.applicationId,
    interviewId: assessment.interviewId ?? interviewId,
    overallScore: assessment.overallScore,
    recommendation: assessment.recommendation,
    summary: assessment.summary,
    dimensions,
    strengths: stringArray(assessment.strengths),
    risks: stringArray(assessment.risks),
    contradictions: stringArray(assessment.unresolvedConcerns),
    unresolvedConcerns: stringArray(assessment.unresolvedConcerns),
    generatedAt: assessment.generatedAt.toISOString(),
    source: assessment.source,
    isDemo: assessment.isDemo,
    provider: assessment.provider,
    model: assessment.model,
    rubricVersion: assessment.rubricVersion,
    promptVersion: assessment.promptVersion,
    transcriptId: assessment.transcriptId,
    transcriptVersion: assessment.transcriptVersion,
    reviewStatus: assessment.reviewStatus,
    reviewedAt: assessment.reviewedAt?.toISOString() ?? null,
    reviewNote: assessment.reviewNote,
    aiGenerated: assessment.source === "AI" && !assessment.isDemo
  };
}
