import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { resetCvScannerCache, type CvScanner } from "@/lib/server/cv/scanner";
import { runScanWorkerOnce } from "@/lib/server/cv/scan-queue";
import { scanCvFile } from "@/lib/server/cv/scan-service";
import { LocalPrivateCvStorage } from "@/lib/server/cv/storage";
import type { HrContext } from "@/lib/server/session";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

suite("Phase 2A database isolation (TEST_DATABASE_URL)", () => {
  let prisma: PrismaClient;
  let hr: typeof import("@/lib/server/recruitment/hr");
  let applications: typeof import("@/lib/server/recruitment/applications");
  let orgA: string;
  let orgB: string;
  let userA: string;
  let userB: string;
  let jobA: string;
  let applicationA: string;
  let cvA: string;
  let keyA: string;
  let scanRoot: string;
  let scanStorage: LocalPrivateCvStorage;

  beforeAll(async () => {
    process.env.APP_DATA_MODE = "database";
    process.env.DATABASE_URL = testUrl;
    process.env.AUTH_SECRET = "integration-test-secret-value-1234567890";

    prisma = (await import("@/lib/server/db")).getPrisma();
    hr = await import("@/lib/server/recruitment/hr");
    applications = await import("@/lib/server/recruitment/applications");
    scanRoot = await mkdtemp(path.join(os.tmpdir(), "ecopanel-db-scan-"));
    scanStorage = new LocalPrivateCvStorage(scanRoot);
    process.env.CV_STORAGE_DIR = scanRoot;

    const suffix = randomUUID().slice(0, 8);
    const orgs = await Promise.all([
      prisma.organization.create({ data: { name: "Org A", slug: `org-a-${suffix}` } }),
      prisma.organization.create({ data: { name: "Org B", slug: `org-b-${suffix}` } })
    ]);
    orgA = orgs[0].id;
    orgB = orgs[1].id;

    const users = await Promise.all([
      prisma.user.create({ data: { name: "Alice", email: `alice-${suffix}@example.com`, emailVerified: true } }),
      prisma.user.create({ data: { name: "Bob", email: `bob-${suffix}@example.com`, emailVerified: true } })
    ]);
    userA = users[0].id;
    userB = users[1].id;
    await prisma.membership.createMany({
      data: [
        { organizationId: orgA, userId: userA, role: "OWNER" },
        { organizationId: orgB, userId: userB, role: "OWNER" }
      ]
    });

    const job = await prisma.job.create({
      data: {
        id: `job-${suffix}`,
        organizationId: orgA,
        title: "Backend Engineer",
        department: "Engineering",
        location: "London",
        workplace: "Hybrid",
        employmentType: "Full-time",
        shortDescription: "Build reliable systems.",
        description: "A persisted job for integration tests.",
        responsibilities: [],
        qualifications: [],
        salaryRange: "Competitive",
        status: "Published",
        publicVisible: true,
        publishedAt: new Date()
      }
    });
    jobA = job.id;

    const candidate = await prisma.candidate.create({
      data: {
        organizationId: orgA,
        name: "Candidate A",
        email: `candidate-${suffix}@example.com`,
        emailNormalized: `candidate-${suffix}@example.com`,
        phone: "+44 7700 900111"
      }
    });
    keyA = `idempotency-${suffix}`;
    const application = await prisma.application.create({
      data: {
        organizationId: orgA,
        jobId: jobA,
        candidateId: candidate.id,
        stage: "New",
        coverLetter: "A sufficiently long cover letter for the integration test.",
        consentVersion: "test",
        consentAt: new Date(),
        idempotencyKey: keyA,
        cvFile: {
          create: {
            organizationId: orgA,
            storageKey: `cv/${orgA}/${randomUUID()}.pdf`,
            originalFilename: "candidate.pdf",
            mimeType: "application/pdf",
            sizeBytes: 100,
            checksum: "a".repeat(64),
            scanStatus: "CLEAN"
          }
        }
      },
      include: { cvFile: true }
    });
    applicationA = application.id;
    cvA = application.cvFile!.id;
  });

  afterAll(async () => {
    if (scanRoot) await rm(scanRoot, { recursive: true, force: true });
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  async function pendingCv() {
    const buffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    const suffix = randomUUID();
    const stored = await scanStorage.put({ organizationId: orgA, kind: "pdf", buffer });
    const candidate = await prisma.candidate.create({
      data: {
        organizationId: orgA,
        name: `Scan Candidate ${suffix.slice(0, 8)}`,
        email: `scan-${suffix}@example.com`,
        emailNormalized: `scan-${suffix}@example.com`,
        phone: "+44 7700 900222"
      }
    });
    const application = await prisma.application.create({
      data: {
        organizationId: orgA,
        jobId: jobA,
        candidateId: candidate.id,
        stage: "New",
        coverLetter: "A sufficiently long cover letter for the scan integration test.",
        consentVersion: "test",
        consentAt: new Date(),
        idempotencyKey: `scan-${randomUUID()}`,
        cvFile: {
          create: {
            organizationId: orgA,
            storageKey: stored.key,
            originalFilename: "scan.pdf",
            mimeType: "application/pdf",
            sizeBytes: stored.sizeBytes,
            checksum: createHash("sha256").update(buffer).digest("hex"),
            scanStatus: "PENDING"
          }
        }
      },
      include: { cvFile: true }
    });
    return { buffer, application, cv: application.cvFile! };
  }

  const contextA = (): HrContext => ({
    user: { id: userA, name: "Alice", email: "alice@example.com" },
    organization: { id: orgA, name: "Org A", slug: "org-a" },
    role: "OWNER",
    sessionId: "session-a"
  });
  const contextB = (): HrContext => ({
    user: { id: userB, name: "Bob", email: "bob@example.com" },
    organization: { id: orgB, name: "Org B", slug: "org-b" },
    role: "OWNER",
    sessionId: "session-b"
  });

  it("does not expose an application across organizations", async () => {
    await expect(hr.getHrApplication(orgB, applicationA)).resolves.toBeNull();
    const listB = await hr.listHrApplications({ organizationId: orgB });
    expect(listB.total).toBe(0);
  });

  it("prevents cross-organization stage and note mutations", async () => {
    await expect(hr.updateApplicationStage(contextB(), applicationA, "Shortlisted")).rejects.toMatchObject({ status: 404 });
    await expect(hr.addApplicationNote(contextB(), applicationA, "Cross-org note")).rejects.toMatchObject({ status: 404 });
    await expect(hr.getCvForDownload(orgB, cvA)).rejects.toMatchObject({ status: 404 });
  });

  it("persists stage and note changes for the owning organization", async () => {
    const updated = await hr.updateApplicationStage(contextA(), applicationA, "Shortlisted");
    expect(updated.application.stage).toBe("Shortlisted");
    await hr.addApplicationNote(contextA(), applicationA, "Notes are persisted in the database.");
    const detail = await hr.getHrApplication(orgA, applicationA);
    expect(detail?.application.notes).toHaveLength(1);
    expect(detail?.application.history.some(event => event.type === "status")).toBe(true);
  });

  it("persists a clean CV scan verdict and blocks concurrent duplicate scans", async () => {
    const { cv } = await pendingCv();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let crossedStart!: () => void;
    const started = new Promise<void>(resolve => { crossedStart = resolve; });
    const scan = vi.fn(async () => {
      crossedStart();
      await gate;
      return { status: "CLEAN" as const, provider: "fake" };
    });
    const scanner: CvScanner = { name: "fake", scan };

    const first = scanCvFile(cv.id, { prisma, storage: scanStorage, scanner });
    await started;
    const second = await scanCvFile(cv.id, { prisma, storage: scanStorage, scanner });
    expect(second.outcome).toBe("skipped");
    expect(scan).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toMatchObject({ outcome: "updated", status: "CLEAN" });

    const stored = await prisma.cvFile.findUnique({ where: { id: cv.id } });
    expect(stored).toMatchObject({ scanStatus: "CLEAN", scanProvider: "fake", scanAttempts: 1 });
    expect(stored?.scanCompletedAt).toBeInstanceOf(Date);
  });

  it("records a failed scan and allows a later retry to scan the same file", async () => {
    const { cv } = await pendingCv();
    const scan = vi.fn()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce({ status: "CLEAN" as const, provider: "fake" });
    const scanner: CvScanner = { name: "fake", scan };

    await expect(scanCvFile(cv.id, { prisma, storage: scanStorage, scanner }))
      .resolves.toMatchObject({ outcome: "updated", status: "SCAN_FAILED" });
    await expect(scanCvFile(cv.id, { prisma, storage: scanStorage, scanner }))
      .resolves.toMatchObject({ outcome: "updated", status: "CLEAN" });

    const stored = await prisma.cvFile.findUnique({ where: { id: cv.id } });
    expect(stored).toMatchObject({ scanStatus: "CLEAN", scanAttempts: 2 });
  });

  it("removes infected content and keeps safe metadata for audit", async () => {
    const { cv } = await pendingCv();
    const scanner: CvScanner = {
      name: "fake",
      scan: vi.fn(async () => ({ status: "INFECTED" as const, provider: "fake", detail: "Eicar-Test-Signature" }))
    };

    await expect(scanCvFile(cv.id, { prisma, storage: scanStorage, scanner }))
      .resolves.toMatchObject({ outcome: "updated", status: "INFECTED" });

    const stored = await prisma.cvFile.findUnique({ where: { id: cv.id } });
    expect(stored).toMatchObject({
      scanStatus: "INFECTED",
      scanDetail: "Eicar-Test-Signature",
      originalFilename: "scan.pdf"
    });
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    await expect(scanStorage.read(cv.storageKey)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("scans uploaded CVs, returns a clean status, and quarantines infected content", async () => {
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(Buffer.concat(chunks).includes("EICAR")
          ? { status: "infected", detail: "Eicar-Test-Signature" }
          : { status: "clean" }));
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No scanner port.");
    process.env.CV_SCANNER_PROVIDER = "http";
    process.env.CV_SCANNER_URL = `http://127.0.0.1:${address.port}`;
    resetCvScannerCache();

    const form = (email: string, buffer: Buffer) => {
      const data = new FormData();
      data.set("jobId", jobA);
      data.set("name", "Upload Scanner Candidate");
      data.set("email", email);
      data.set("phone", "+44 7700 900333");
      data.set("linkedinUrl", "");
      data.set("githubUrl", "");
      data.set("portfolioUrl", "");
      data.set("coverLetter", "This cover letter is long enough to pass the public application validation rules.");
      data.set("consent", "on");
      data.set("cv", new File([new Uint8Array(buffer)], "cv.pdf", { type: "application/pdf" }));
      return data;
    };
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
    const cleanKey = `upload-clean-${randomUUID()}`;
    const infectedKey = `upload-infected-${randomUUID()}`;

    try {
      const clean = await applications.submitPublicApplication({
        jobId: jobA,
        formData: form(`clean-${randomUUID()}@example.com`, pdf),
        idempotencyKey: cleanKey
      });
      expect(clean.summary.cvStatus).toContain("Scanning");
      expect(await prisma.cvScanJob.count({ where: { cvFile: { application: { idempotencyKey: cleanKey } } } })).toBe(1);

      const cleanProcessed = await runScanWorkerOnce({
        prisma,
        storage: scanStorage,
        workerId: "database-test",
        now: () => new Date()
      });
      expect(cleanProcessed).toMatchObject({ outcome: "succeeded", scanStatus: "CLEAN" });
      const cleanRecord = await prisma.application.findUnique({
        where: { idempotencyKey: cleanKey },
        include: { cvFile: { include: { scanJob: true } } }
      });
      expect(cleanRecord?.cvFile).toMatchObject({ scanStatus: "CLEAN", scanAttempts: 1 });
      expect(cleanRecord?.cvFile?.scanJob).toMatchObject({ status: "SUCCEEDED", attempts: 1 });

      const infected = await applications.submitPublicApplication({
        jobId: jobA,
        formData: form(`infected-${randomUUID()}@example.com`, Buffer.concat([pdf, Buffer.from("EICAR")])),
        idempotencyKey: infectedKey
      });
      expect(infected.summary.cvStatus).toContain("Scanning");
      const infectedProcessed = await runScanWorkerOnce({
        prisma,
        storage: scanStorage,
        workerId: "database-test",
        now: () => new Date()
      });
      expect(infectedProcessed).toMatchObject({ outcome: "succeeded", scanStatus: "INFECTED" });
      const infectedRecord = await prisma.application.findUnique({
        where: { idempotencyKey: infectedKey },
        include: { cvFile: true }
      });
      expect(infectedRecord?.cvFile).toMatchObject({
        scanStatus: "INFECTED",
        scanDetail: "Eicar-Test-Signature",
        originalFilename: "cv.pdf"
      });
      expect(infectedRecord?.cvFile?.deletedAt).toBeInstanceOf(Date);
      await expect(scanStorage.read(infectedRecord!.cvFile!.storageKey)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      delete process.env.CV_SCANNER_PROVIDER;
      delete process.env.CV_SCANNER_URL;
      resetCvScannerCache();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("returns the original application for a repeated idempotency key", async () => {
    const duplicate = await applications.submitPublicApplication({
      jobId: jobA,
      formData: new FormData(),
      idempotencyKey: keyA
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.summary.publicReference).toBeTruthy();
  });
});
