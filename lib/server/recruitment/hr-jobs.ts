import { randomUUID } from "node:crypto";
import type { Job as PrismaJob, Prisma } from "@prisma/client";
import type { EmploymentType, Job, JobStatus, NewJobInput, Workplace } from "@/lib/domain";
import { getPrisma } from "@/lib/server/db";
import { toDomainJob } from "@/lib/server/recruitment/jobs";
import type { HrContext } from "@/lib/server/session";

export class HrJobError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "HrJobError";
  }
}

const JOB_STATUSES: JobStatus[] = ["Draft", "Published", "Closed"];
const WORKPLACES: Workplace[] = ["Remote", "Hybrid", "On-site"];
const EMPLOYMENT_TYPES: EmploymentType[] = ["Full-time", "Contract", "Part-time", "Internship"];

export interface HrJobInput extends NewJobInput {}

export interface HrJobSummary {
  total: number;
  published: number;
  drafts: number;
  closed: number;
}

export interface HrJobRecord {
  job: Job;
  counts: {
    applications: number;
    interviewStage: number;
    selected: number;
  };
}

function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string") throw new HrJobError(`${label} is required.`, 400, "INVALID_JOB");
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new HrJobError(`${label} must be between ${min} and ${max} characters.`, 400, "INVALID_JOB");
  }
  return normalized;
}

function stringList(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new HrJobError(`${label} must be a list.`, 400, "INVALID_JOB");
  const items = value.map(item => typeof item === "string" ? item.trim() : "").filter(Boolean);
  if (!items.length) throw new HrJobError(`Add at least one ${label.toLowerCase()} item.`, 400, "INVALID_JOB");
  if (items.length > 20 || items.some(item => item.length > 500)) {
    throw new HrJobError(`${label} must contain at most 20 items of 500 characters each.`, 400, "INVALID_JOB");
  }
  return items;
}

export function normalizeJobInput(input: unknown): HrJobInput {
  if (!input || typeof input !== "object") throw new HrJobError("Send a job payload.", 400, "INVALID_JOB");
  const raw = input as Record<string, unknown>;
  const status = raw.status as JobStatus;
  if (!JOB_STATUSES.includes(status)) throw new HrJobError("Choose a valid job status.", 400, "INVALID_JOB");
  const workplace = raw.workplace as Workplace;
  if (!WORKPLACES.includes(workplace)) throw new HrJobError("Choose a valid workplace.", 400, "INVALID_JOB");
  const employmentType = raw.employmentType as EmploymentType;
  if (!EMPLOYMENT_TYPES.includes(employmentType)) throw new HrJobError("Choose a valid employment type.", 400, "INVALID_JOB");
  return {
    title: text(raw.title, "Job title", 3, 140),
    department: text(raw.department, "Department", 2, 80),
    location: text(raw.location, "Location", 2, 120),
    workplace,
    employmentType,
    shortDescription: text(raw.shortDescription, "Short description", 20, 500),
    description: text(raw.description, "Description", 80, 20_000),
    responsibilities: stringList(raw.responsibilities, "Responsibilities"),
    qualifications: stringList(raw.qualifications, "Qualifications"),
    salaryRange: text(raw.salaryRange, "Salary range", 2, 160),
    status,
    publicVisible: raw.publicVisible === true
  };
}

function jobData(organizationId: string, input: HrJobInput, existing?: PrismaJob): Prisma.JobUncheckedCreateInput {
  const publishedNow = input.status === "Published";
  return {
    id: existing?.id ?? `job-${randomUUID()}`,
    organizationId,
    title: input.title,
    department: input.department,
    location: input.location,
    workplace: input.workplace,
    employmentType: input.employmentType,
    shortDescription: input.shortDescription,
    description: input.description,
    responsibilities: input.responsibilities as Prisma.InputJsonValue,
    qualifications: input.qualifications as Prisma.InputJsonValue,
    salaryRange: input.salaryRange,
    status: input.status,
    publicVisible: input.status === "Published" ? input.publicVisible : input.publicVisible,
    publishedAt: publishedNow ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null
  };
}

export async function listHrJobs(organizationId: string, filters: { q?: string; status?: string; department?: string } = {}) {
  const q = filters.q?.trim() ?? "";
  const status = filters.status?.trim() ?? "";
  const department = filters.department?.trim() ?? "";
  if (status && status !== "All" && !JOB_STATUSES.includes(status as JobStatus)) {
    throw new HrJobError("Unknown job status.", 400, "INVALID_JOB_STATUS");
  }
  const where: Prisma.JobWhereInput = {
    organizationId,
    ...(status && status !== "All" ? { status } : {}),
    ...(department && department !== "All" ? { department } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { department: { contains: q, mode: "insensitive" } },
            { location: { contains: q, mode: "insensitive" } },
            { employmentType: { contains: q, mode: "insensitive" } }
          ]
        }
      : {})
  };

  const [jobs, grouped, allStatuses, departments] = await Promise.all([
    getPrisma().job.findMany({ where, orderBy: { createdAt: "desc" } }),
    getPrisma().application.groupBy({
      by: ["jobId"],
      where: { organizationId },
      _count: { _all: true }
    }),
    getPrisma().job.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true }
    }),
    getPrisma().job.findMany({
      where: { organizationId },
      distinct: ["department"],
      select: { department: true },
      orderBy: { department: "asc" }
    })
  ]);

  const applicantCounts = Object.fromEntries(grouped.map(item => [item.jobId, item._count._all]));
  const summary: HrJobSummary = {
    total: allStatuses.reduce((sum, item) => sum + item._count._all, 0),
    published: allStatuses.find(item => item.status === "Published")?._count._all ?? 0,
    drafts: allStatuses.find(item => item.status === "Draft")?._count._all ?? 0,
    closed: allStatuses.find(item => item.status === "Closed")?._count._all ?? 0
  };

  return {
    jobs: jobs.map(toDomainJob),
    applicantCounts,
    summary,
    departments: departments.map(item => item.department),
    filters: { q, status: status || "All", department: department || "All" }
  };
}

export async function getHrJob(organizationId: string, id: string): Promise<HrJobRecord | null> {
  const job = await getPrisma().job.findFirst({ where: { id, organizationId } });
  if (!job) return null;
  const counts = await getPrisma().application.groupBy({
    by: ["stage"],
    where: { organizationId, jobId: id },
    _count: { _all: true }
  });
  const count = (stage: string) => counts.find(item => item.stage === stage)?._count._all ?? 0;
  return {
    job: toDomainJob(job),
    counts: {
      applications: counts.reduce((sum, item) => sum + item._count._all, 0),
      interviewStage: count("Interview"),
      selected: count("Selected")
    }
  };
}

export async function createHrJob(context: HrContext, raw: unknown): Promise<Job> {
  const input = normalizeJobInput(raw);
  const job = await getPrisma().job.create({ data: jobData(context.organization.id, input) });
  return toDomainJob(job);
}

export async function updateHrJob(context: HrContext, id: string, raw: unknown): Promise<Job> {
  const input = normalizeJobInput(raw);
  const existing = await getPrisma().job.findFirst({
    where: { id, organizationId: context.organization.id }
  });
  if (!existing) throw new HrJobError("Job not found.", 404, "JOB_NOT_FOUND");
  const data = jobData(context.organization.id, input, existing);
  const job = await getPrisma().job.update({ where: { id }, data });
  return toDomainJob(job);
}

export async function setHrJobStatus(context: HrContext, id: string, status: JobStatus): Promise<Job> {
  if (!JOB_STATUSES.includes(status)) throw new HrJobError("Choose a valid job status.", 400, "INVALID_JOB_STATUS");
  const existing = await getPrisma().job.findFirst({
    where: { id, organizationId: context.organization.id }
  });
  if (!existing) throw new HrJobError("Job not found.", 404, "JOB_NOT_FOUND");

  const published = status === "Published";
  const job = await getPrisma().job.update({
    where: { id },
    data: {
      status,
      publicVisible: published ? true : false,
      publishedAt: published ? existing.publishedAt ?? new Date() : existing.publishedAt
    }
  });
  return toDomainJob(job);
}
