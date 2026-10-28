import type { Job as PrismaJob } from "@prisma/client";
import type { Job, Workplace } from "@/lib/domain";
import { getPrisma } from "@/lib/server/db";

export function toDomainJob(job: PrismaJob): Job {
  return {
    id: job.id,
    title: job.title,
    department: job.department,
    location: job.location,
    workplace: job.workplace as Workplace,
    employmentType: job.employmentType as Job["employmentType"],
    shortDescription: job.shortDescription,
    description: job.description,
    responsibilities: Array.isArray(job.responsibilities) ? job.responsibilities.map(String) : [],
    qualifications: Array.isArray(job.qualifications) ? job.qualifications.map(String) : [],
    salaryRange: job.salaryRange,
    status: job.status as Job["status"],
    publicVisible: job.publicVisible,
    publishedAt: job.publishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString()
  };
}

export async function listPublishedJobs(): Promise<Job[]> {
  const jobs = await getPrisma().job.findMany({
    where: { status: "Published", publicVisible: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }]
  });
  return jobs.map(toDomainJob);
}

export async function getPublishedJob(id: string): Promise<Job | null> {
  const job = await getPrisma().job.findFirst({
    where: { id, status: "Published", publicVisible: true }
  });
  return job ? toDomainJob(job) : null;
}
