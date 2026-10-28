import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { CvScanner } from "@/lib/server/cv/scanner";
import {
  claimNextScanJob,
  enqueueCvScanJob,
  enqueueMissingScanJobs,
  processClaimedScanJob,
  requeueFailedScanJobs,
  runScanWorkerOnce,
  scanRetryDelayMs
} from "@/lib/server/cv/scan-queue";
import { LocalPrivateCvStorage } from "@/lib/server/cv/storage";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const testUrl = process.env.TEST_DATABASE_URL;

describe("scan retry backoff", () => {
  it("grows exponentially, adds bounded jitter, and caps at five minutes", () => {
    expect(scanRetryDelayMs(1, () => 0)).toBe(5_000);
    expect(scanRetryDelayMs(2, () => 0)).toBe(10_000);
    expect(scanRetryDelayMs(3, () => 0)).toBe(20_000);
    expect(scanRetryDelayMs(1, () => 0.9999)).toBeGreaterThanOrEqual(5_999);
    expect(scanRetryDelayMs(20, () => 0.5)).toBe(300_000);
  });
});

const suite = testUrl ? describe : describe.skip;

suite("durable CV scan queue (TEST_DATABASE_URL)", () => {
  let prisma: PrismaClient;
  let orgId: string;
  let jobId: string;
  let storage: LocalPrivateCvStorage;
  let storageRoot: string;

  beforeAll(async () => {
    process.env.APP_DATA_MODE = "database";
    process.env.DATABASE_URL = testUrl;
    process.env.AUTH_SECRET = "integration-test-secret-value-1234567890";
    prisma = (await import("@/lib/server/db")).getPrisma();
    storageRoot = await mkdtemp(path.join(os.tmpdir(), "ecopanel-scan-queue-"));
    storage = new LocalPrivateCvStorage(storageRoot);

    const suffix = randomUUID().slice(0, 8);
    const org = await prisma.organization.create({ data: { name: "Queue Org", slug: `queue-org-${suffix}` } });
    orgId = org.id;
    const job = await prisma.job.create({
      data: {
        id: `queue-job-${suffix}`,
        organizationId: orgId,
        title: "Queue Engineer",
        department: "Engineering",
        location: "London",
        workplace: "Hybrid",
        employmentType: "Full-time",
        shortDescription: "Test durable scanning.",
        description: "Test durable scanning.",
        responsibilities: [],
        qualifications: [],
        salaryRange: "Competitive",
        status: "Published",
        publicVisible: true,
        publishedAt: new Date()
      }
    });
    jobId = job.id;
  });

  afterEach(async () => {
    if (prisma && orgId) await prisma.cvScanJob.deleteMany({ where: { organizationId: orgId } });
  });

  afterAll(async () => {
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
    if (!prisma) return;
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  async function createCv(scanStatus = "PENDING") {
    const stored = await storage.put({ organizationId: orgId, kind: "pdf", buffer: pdf });
    const email = `queue-${randomUUID()}@example.com`;
    const candidate = await prisma.candidate.create({
      data: {
        organizationId: orgId,
        name: "Queue Candidate",
        email,
        emailNormalized: email,
        phone: "+44 7700 900444"
      }
    });
    const application = await prisma.application.create({
      data: {
        organizationId: orgId,
        jobId,
        candidateId: candidate.id,
        coverLetter: "This cover letter is long enough to pass validation.",
        consentVersion: "v1",
        consentAt: new Date()
      }
    });
    return prisma.cvFile.create({
      data: {
        organizationId: orgId,
        applicationId: application.id,
        storageKey: stored.key,
        originalFilename: "cv.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        checksum: createHash("sha256").update(pdf).digest("hex"),
        scanStatus
      }
    });
  }

  it("claims a job once, records success, and does not rescan immediately", async () => {
    const cv = await createCv();
    const enqueued = await enqueueCvScanJob(prisma, { cvFileId: cv.id, organizationId: orgId });
    expect(enqueued.status).toBe("PENDING");

    const now = new Date("2030-01-01T00:00:00.000Z");
    const claimed = await claimNextScanJob(prisma, { workerId: "worker-a", leaseMs: 60_000, now });
    expect(claimed).toMatchObject({ cvFileId: cv.id, attempts: 1 });
    expect(await claimNextScanJob(prisma, { workerId: "worker-b", now })).toBeNull();

    const scanner: CvScanner = { name: "fake", scan: vi.fn(async () => ({ status: "CLEAN" as const, provider: "fake" })) };
    const processed = await processClaimedScanJob(claimed!, {
      prisma,
      storage,
      scanner,
      workerId: "worker-a",
      now: () => now
    });
    expect(processed).toMatchObject({ outcome: "succeeded", scanStatus: "CLEAN", attempts: 1 });

    const saved = await prisma.cvScanJob.findUnique({ where: { cvFileId: cv.id } });
    expect(saved).toMatchObject({ status: "SUCCEEDED", attempts: 1, leaseOwner: null, leaseExpiresAt: null });
    expect(saved?.completedAt).toBeInstanceOf(Date);
    await expect(prisma.cvFile.findUnique({ where: { id: cv.id } }))
      .resolves.toMatchObject({ scanStatus: "CLEAN", scanAttempts: 1 });
    expect(await claimNextScanJob(prisma, { workerId: "worker-b", now: new Date(now.getTime() + 1) })).toBeNull();
  });

  it("recovers an expired RUNNING lease", async () => {
    const cv = await createCv();
    const job = await enqueueCvScanJob(prisma, { cvFileId: cv.id, organizationId: orgId });
    await prisma.cvScanJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        leaseOwner: "dead-worker",
        leaseExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
        attempts: 1
      }
    });
    const claimed = await claimNextScanJob(prisma, {
      workerId: "recovery-worker",
      now: new Date("2030-01-01T00:01:00.000Z")
    });
    expect(claimed).toMatchObject({ id: job.id, attempts: 2 });
  });

  it("retries failed scans and stops at the configured attempt limit", async () => {
    const cv = await createCv();
    await enqueueCvScanJob(prisma, { cvFileId: cv.id, organizationId: orgId, maxAttempts: 2 });
    const scanner: CvScanner = {
      name: "fake",
      scan: vi.fn(async () => ({ status: "SCAN_FAILED" as const, provider: "fake", detail: "Scanner offline\nretry" }))
    };
    let now = new Date("2030-02-01T00:00:00.000Z");

    const first = await runScanWorkerOnce({ prisma, storage, scanner, workerId: "retry-a", now: () => now });
    expect(first).toMatchObject({ outcome: "retry", attempts: 1 });
    expect(first?.error).toBe("Scanner offline retry");
    const retryJob = await prisma.cvScanJob.findUnique({ where: { cvFileId: cv.id } });
    expect(retryJob?.status).toBe("RETRY");
    expect(retryJob?.availableAt.getTime()).toBeGreaterThan(now.getTime());
    expect(await claimNextScanJob(prisma, { workerId: "too-early", now })).toBeNull();

    now = new Date(retryJob!.availableAt.getTime() + 1);
    const second = await runScanWorkerOnce({ prisma, storage, scanner, workerId: "retry-b", now: () => now });
    expect(second).toMatchObject({ outcome: "failed", attempts: 2 });
    const failedJob = await prisma.cvScanJob.findUnique({ where: { cvFileId: cv.id } });
    expect(failedJob).toMatchObject({ status: "FAILED", attempts: 2, completedAt: expect.any(Date) });
    expect(await claimNextScanJob(prisma, { workerId: "after", now: new Date(now.getTime() + 60_000) })).toBeNull();
    await expect(prisma.cvFile.findUnique({ where: { id: cv.id } })).resolves.toMatchObject({ scanStatus: "SCAN_FAILED" });
  });

  it("does not let a stale worker finalize another worker's job", async () => {
    const cv = await createCv();
    const job = await enqueueCvScanJob(prisma, { cvFileId: cv.id, organizationId: orgId });
    const claimed = await claimNextScanJob(prisma, {
      workerId: "owner",
      now: new Date("2030-03-01T00:00:00.000Z")
    });
    expect(claimed?.id).toBe(job.id);
    const scanner: CvScanner = { name: "fake", scan: vi.fn(async () => ({ status: "CLEAN" as const, provider: "fake" })) };
    const result = await processClaimedScanJob(claimed!, {
      prisma,
      storage,
      scanner,
      workerId: "impostor"
    });
    expect(result.outcome).toBe("collision");
    await expect(prisma.cvScanJob.findUnique({ where: { id: job.id } }))
      .resolves.toMatchObject({ status: "RUNNING", leaseOwner: "owner" });
  });

  it("backfills missing jobs and requeues terminal failures", async () => {
    const cv = await createCv("SCAN_FAILED");
    const backfill = await enqueueMissingScanJobs(prisma);
    expect(backfill.enqueued).toBeGreaterThanOrEqual(1);
    const job = await prisma.cvScanJob.findUnique({ where: { cvFileId: cv.id } });
    expect(job?.status).toBe("PENDING");

    await prisma.cvScanJob.update({
      where: { id: job!.id },
      data: { status: "FAILED", attempts: 5, lastError: "old failure", completedAt: new Date() }
    });
    const requeued = await requeueFailedScanJobs(prisma);
    expect(requeued.requeued).toBeGreaterThanOrEqual(1);
    await expect(prisma.cvScanJob.findUnique({ where: { id: job!.id } }))
      .resolves.toMatchObject({ status: "PENDING", attempts: 0, lastError: null, completedAt: null });
  });
});
