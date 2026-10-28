import { Prisma, type CvFile, type HrRole } from "@prisma/client";
import {
  APPLICATION_STAGES,
  type Application,
  type ApplicationEventType,
  type ApplicationStage,
  type Candidate,
  type Job
} from "@/lib/domain";
import { cvDownloadability, cvStorageStatusLabel } from "@/lib/server/cv/policy";
import type { CvScanStatus } from "@/lib/server/cv/scanner";
import { getPrisma } from "@/lib/server/db";
import { enqueueHiringNotification, notificationActor, stageNotificationKind } from "@/lib/server/email/notifications";
import { toDomainJob } from "@/lib/server/recruitment/jobs";
import type { HrContext } from "@/lib/server/session";

export type HrApplicationRecord = Prisma.ApplicationGetPayload<{
  include: {
    candidate: true;
    job: true;
    cvFile: true;
    notes: { include: { author: true } };
    events: true;
  };
}>;

export type HrApplicationSummaryRecord = Prisma.ApplicationGetPayload<{
  include: { candidate: true; job: true; cvFile: true };
}>;

export class HrRecruitmentError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "HrRecruitmentError";
  }
}

export function toDomainCandidate(candidate: HrApplicationRecord["candidate"]): Candidate {
  return {
    id: candidate.id,
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    headline: candidate.headline,
    linkedinUrl: candidate.linkedinUrl,
    githubUrl: candidate.githubUrl,
    portfolioUrl: candidate.portfolioUrl
  };
}

function cvMetadata(cv: CvFile | null): Application["cv"] {
  if (!cv) {
    return {
      fileName: "No CV attached",
      size: 0,
      mimeType: "application/octet-stream",
      uploadedAt: new Date(0).toISOString(),
      storageStatus: "Blocked",
      downloadable: false
    };
  }
  const status = cv.scanStatus as CvScanStatus;
  const download = cvDownloadability(status);
  const storageStatus: Application["cv"]["storageStatus"] =
    status === "CLEAN" ? "Private storage" : status === "UNSCANNED" || status === "PENDING" ? "Pending scan" : "Blocked";
  return {
    fileName: cv.originalFilename,
    size: cv.sizeBytes,
    mimeType: cv.mimeType,
    uploadedAt: cv.uploadedAt.toISOString(),
    storageStatus,
    cvId: cv.id,
    scanStatus: status,
    downloadUrl: `/api/hr/cv/${cv.id}`,
    downloadable: download.allowed
  };
}

export function toDomainApplication(record: HrApplicationRecord): Application {
  return {
    id: record.id,
    candidateId: record.candidateId,
    jobId: record.jobId,
    appliedAt: record.appliedAt.toISOString(),
    stage: record.stage as ApplicationStage,
    source: record.source,
    coverLetter: record.coverLetter,
    cv: cvMetadata(record.cvFile),
    notes: record.notes.map(note => ({
      id: note.id,
      author: note.authorLabel,
      body: note.body,
      createdAt: note.createdAt.toISOString()
    })),
    history: record.events.map(event => ({
      id: event.id,
      type: event.type as ApplicationEventType,
      label: event.label,
      detail: event.detail,
      createdAt: event.createdAt.toISOString(),
      actor: event.actorLabel
    }))
  };
}

export function toSummaryApplication(record: HrApplicationSummaryRecord): { application: Application; candidate: Candidate; job: Job } {
  return {
    application: {
      id: record.id,
      candidateId: record.candidateId,
      jobId: record.jobId,
      appliedAt: record.appliedAt.toISOString(),
      stage: record.stage as ApplicationStage,
      source: record.source,
      coverLetter: record.coverLetter,
      cv: cvMetadata(record.cvFile),
      notes: [],
      history: []
    },
    candidate: toDomainCandidate(record.candidate),
    job: toDomainJob(record.job)
  };
}

const fullInclude = {
  candidate: true,
  job: true,
  cvFile: true,
  notes: { orderBy: { createdAt: "desc" }, include: { author: true } },
  events: { orderBy: { createdAt: "asc" } }
} satisfies Prisma.ApplicationInclude;

export async function listHrApplications(input: {
  organizationId: string;
  search?: string;
  stage?: string;
  jobId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 50)));
  const stage = input.stage?.trim();
  if (stage && !APPLICATION_STAGES.includes(stage as ApplicationStage)) {
    throw new HrRecruitmentError("Unknown application stage.", 400, "INVALID_STAGE");
  }

  const where: Prisma.ApplicationWhereInput = {
    organizationId: input.organizationId,
    ...(stage ? { stage } : {}),
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.search?.trim()
      ? {
          OR: [
            { candidate: { name: { contains: input.search.trim(), mode: "insensitive" } } },
            { candidate: { email: { contains: input.search.trim(), mode: "insensitive" } } },
            { job: { title: { contains: input.search.trim(), mode: "insensitive" } } }
          ]
        }
      : {})
  };

  const [total, records, stageGroups, jobs] = await Promise.all([
    getPrisma().application.count({ where }),
    getPrisma().application.findMany({
      where,
      include: { candidate: true, job: true, cvFile: true },
      orderBy: { appliedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    getPrisma().application.groupBy({
      by: ["stage"],
      where: { organizationId: input.organizationId },
      _count: { _all: true }
    }),
    getPrisma().job.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, status: true }
    })
  ]);

  const mapped = records.map(toSummaryApplication);
  return {
    applications: mapped.map(item => item.application),
    candidates: mapped.map(item => item.candidate),
    jobs: mapped.map(item => item.job),
    filters: { search: input.search ?? "", stage: stage ?? "", jobId: input.jobId ?? "" },
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    stageCounts: Object.fromEntries(stageGroups.map(group => [group.stage, group._count._all])),
    jobOptions: jobs
  };
}

export async function getHrApplication(organizationId: string, id: string) {
  const record = await getPrisma().application.findFirst({
    where: { id, organizationId },
    include: fullInclude
  });
  if (!record) return null;
  return {
    application: toDomainApplication(record),
    candidate: toDomainCandidate(record.candidate),
    job: toDomainJob(record.job)
  };
}

export async function getHrCounts(organizationId: string) {
  const [applications, jobs, interviews] = await Promise.all([
    getPrisma().application.count({ where: { organizationId } }),
    getPrisma().job.count({ where: { organizationId, status: "Published" } }),
    getPrisma().interview.count({ where: { organizationId, status: "Scheduled", scheduledAt: { gte: new Date() } } })
  ]);
  return { applications, jobs, interviews };
}

export async function updateApplicationStage(
  context: HrContext,
  applicationId: string,
  nextStage: string,
  options: { notify?: boolean } = {}
) {
  if (!APPLICATION_STAGES.includes(nextStage as ApplicationStage)) {
    throw new HrRecruitmentError("Unknown application stage.", 400, "INVALID_STAGE");
  }
  const notificationKind = stageNotificationKind(nextStage);
  if (options.notify && !notificationKind) {
    throw new HrRecruitmentError(
      "This stage does not have a candidate status email. Use interview scheduling for interview messages.",
      400,
      "STAGE_NOTIFICATION_UNAVAILABLE"
    );
  }
  const prisma = getPrisma();
  const existing = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: context.organization.id }
  });
  if (!existing) throw new HrRecruitmentError("Application not found.", 404, "APPLICATION_NOT_FOUND");
  if (existing.stage === nextStage) {
    const unchanged = await getHrApplication(context.organization.id, applicationId);
    return { ...unchanged!, changed: false, notificationQueued: false };
  }

  await prisma.$transaction(async tx => {
    await tx.application.update({
      where: { id: applicationId },
      data: { stage: nextStage }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId,
        type: "status",
        label: `Moved to ${nextStage}`,
        detail: `Pipeline stage changed from ${existing.stage} to ${nextStage}.`,
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });
    if (options.notify && notificationKind) {
      await enqueueHiringNotification(tx, {
        organizationId: context.organization.id,
        applicationId,
        kind: notificationKind,
        ...notificationActor(context)
      });
    }
  });

  const updated = await getHrApplication(context.organization.id, applicationId);
  return { ...updated!, changed: true, notificationQueued: Boolean(options.notify && notificationKind) };
}

export async function addApplicationNote(context: HrContext, applicationId: string, body: string) {
  const normalized = body.trim();
  if (normalized.length < 2 || normalized.length > 4000) {
    throw new HrRecruitmentError("Notes must be between 2 and 4,000 characters.", 400, "INVALID_NOTE");
  }
  const existing = await getPrisma().application.findFirst({
    where: { id: applicationId, organizationId: context.organization.id },
    select: { id: true }
  });
  if (!existing) throw new HrRecruitmentError("Application not found.", 404, "APPLICATION_NOT_FOUND");

  const note = await getPrisma().$transaction(async tx => {
    const created = await tx.applicationNote.create({
      data: {
        organizationId: context.organization.id,
        applicationId,
        authorUserId: context.user.id,
        authorLabel: context.user.name,
        body: normalized
      }
    });
    await tx.applicationEvent.create({
      data: {
        organizationId: context.organization.id,
        applicationId,
        type: "note",
        label: "Private note added",
        detail: "A recruiter added an internal note.",
        actorUserId: context.user.id,
        actorLabel: context.user.name
      }
    });
    return created;
  });

  return {
    id: note.id,
    author: note.authorLabel,
    body: note.body,
    createdAt: note.createdAt.toISOString()
  };
}

export async function getCvForDownload(organizationId: string, cvId: string) {
  const cv = await getPrisma().cvFile.findFirst({
    where: { id: cvId, organizationId }
  });
  if (!cv) throw new HrRecruitmentError("CV not found.", 404, "CV_NOT_FOUND");
  return cv;
}

export function cvStatusDescription(cv: CvFile) {
  return cvStorageStatusLabel(cv.scanStatus as CvScanStatus);
}

export function canChangeStage(role: HrRole) {
  return role === "OWNER" || role === "ADMIN" || role === "RECRUITER";
}
