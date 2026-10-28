import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/server/db";
import {
  getCvScanner,
  getCvScannerTimeoutMs,
  type CvScanStatus,
  type CvScanner
} from "@/lib/server/cv/scanner";
import { getCvStorage, type PrivateCvStorage } from "@/lib/server/cv/storage";
import { logError } from "@/lib/server/logger";

export type CvScanOutcome = "updated" | "skipped" | "disabled" | "not_found" | "conflict";

export interface CvScanResultSummary {
  outcome: CvScanOutcome;
  status: CvScanStatus | null;
  provider: string | null;
  detail: string | null;
}

export interface CvScanDependencies {
  prisma?: PrismaClient;
  storage?: PrivateCvStorage;
  scanner?: CvScanner | null;
  now?: () => Date;
  leaseMs?: number;
}

const DEFAULT_LEASE_MS = () => getCvScannerTimeoutMs() * 2 + 5_000;

function cleanDetail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, 240) : null;
}

function checksum(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function integrityFailure(buffer: Buffer, cv: { sizeBytes: number; checksum: string }) {
  if (buffer.length !== cv.sizeBytes) return "Stored file size changed before scanning.";
  if (checksum(buffer) !== cv.checksum) return "Stored file checksum changed before scanning.";
  return null;
}

export async function scanCvFile(cvId: string, dependencies: CvScanDependencies = {}): Promise<CvScanResultSummary> {
  const prisma = dependencies.prisma ?? getPrisma();
  const now = dependencies.now ?? (() => new Date());
  const leaseMs = dependencies.leaseMs ?? DEFAULT_LEASE_MS();
  const cv = await prisma.cvFile.findUnique({ where: { id: cvId } });

  if (!cv) return { outcome: "not_found", status: null, provider: null, detail: null };
  if (cv.deletedAt) {
    return { outcome: "skipped", status: cv.scanStatus as CvScanStatus, provider: cv.scanProvider, detail: cv.scanDetail };
  }

  let scanner: CvScanner | null;
  try {
    scanner = dependencies.scanner !== undefined ? dependencies.scanner : getCvScanner();
  } catch {
    const failedAt = now();
    const failed = await prisma.cvFile.updateMany({
      where: {
        id: cvId,
        deletedAt: null,
        scanStartedAt: null,
        scanStatus: { in: ["PENDING", "UNSCANNED"] }
      },
      data: {
        scanStatus: "SCAN_FAILED",
        scanProvider: "configuration-error",
        scanDetail: "Malware scanner configuration is invalid.",
        scanStartedAt: null,
        scanAttemptId: null,
        scanCompletedAt: failedAt,
        scanAttempts: { increment: 1 }
      }
    });
    return failed.count > 0
      ? { outcome: "updated", status: "SCAN_FAILED", provider: "configuration-error", detail: "Malware scanner configuration is invalid." }
      : { outcome: "skipped", status: cv.scanStatus as CvScanStatus, provider: cv.scanProvider, detail: cv.scanDetail };
  }

  if (!scanner) {
    return { outcome: "disabled", status: cv.scanStatus as CvScanStatus, provider: cv.scanProvider, detail: cv.scanDetail };
  }

  const startedAt = now();
  const attemptId = randomUUID();
  const leaseCutoff = new Date(startedAt.getTime() - leaseMs);
  const claimed = await prisma.cvFile.updateMany({
    where: {
      id: cvId,
      deletedAt: null,
      OR: [
        {
          scanStatus: { in: ["PENDING", "UNSCANNED", "SCAN_FAILED"] },
          scanStartedAt: null
        },
        {
          scanStatus: "PENDING",
          scanStartedAt: { lt: leaseCutoff }
        }
      ]
    },
    data: {
      scanStatus: "PENDING",
      scanAttemptId: attemptId,
      scanStartedAt: startedAt,
      scanCompletedAt: null,
      scanProvider: scanner.name,
      scanDetail: null,
      scanAttempts: { increment: 1 }
    }
  });

  if (claimed.count === 0) {
    const current = await prisma.cvFile.findUnique({ where: { id: cvId } });
    return {
      outcome: "skipped",
      status: (current?.scanStatus as CvScanStatus) ?? null,
      provider: current?.scanProvider ?? null,
      detail: current?.scanDetail ?? null
    };
  }

  const storage = dependencies.storage ?? getCvStorage();
  let finalStatus: CvScanStatus = "SCAN_FAILED";
  let detail: string | null = null;
  let provider = scanner.name;

  try {
    const buffer = await storage.read(cv.storageKey);
    const beforeScanFailure = integrityFailure(buffer, cv);
    if (beforeScanFailure) {
      detail = beforeScanFailure;
    } else {
      let result;
      try {
        result = await scanner.scan({
          buffer,
          filename: cv.originalFilename,
          mimeType: cv.mimeType
        });
      } catch {
        result = { status: "SCAN_FAILED" as const, provider: scanner.name, detail: "Scanner request failed." };
      }

      provider = cleanDetail(result.provider) ?? scanner.name;
      const reportedStatus = result.status;
      if (reportedStatus !== "CLEAN" && reportedStatus !== "INFECTED") {
        finalStatus = "SCAN_FAILED";
        detail = cleanDetail(result.detail) || "Scanner did not return a valid verdict.";
      } else {
        let postScanFailure: string | null = null;
        try {
          const current = await storage.read(cv.storageKey);
          postScanFailure = integrityFailure(current, cv);
        } catch {
          postScanFailure = "Stored file became unavailable during scanning.";
        }
        if (postScanFailure) {
          finalStatus = "SCAN_FAILED";
          detail = postScanFailure;
        } else {
          finalStatus = reportedStatus;
          detail = reportedStatus === "INFECTED"
            ? cleanDetail(result.detail) || "Malware signature detected."
            : null;
        }
      }
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    detail = code === "ENOENT"
      ? "Stored file is missing."
      : "Stored file could not be read for scanning.";
  }

  const completedAt = now();
  const updated = await prisma.cvFile.updateMany({
    where: { id: cvId, scanAttemptId: attemptId, scanStatus: "PENDING" },
    data: {
      scanStatus: finalStatus,
      scanProvider: provider,
      scanDetail: detail,
      scanAttemptId: null,
      scanStartedAt: null,
      scanCompletedAt: completedAt
    }
  });

  if (updated.count === 0) {
    return { outcome: "conflict", status: null, provider, detail: "A newer scan attempt owns this file." };
  }

  if (finalStatus === "INFECTED") {
    try {
      await storage.delete(cv.storageKey);
      await prisma.cvFile.updateMany({
        where: { id: cvId, scanStatus: "INFECTED", deletedAt: null },
        data: { deletedAt: completedAt }
      });
    } catch {
      logError("Infected CV was blocked but its quarantined content could not be deleted.", { cvId });
    }
  }

  return { outcome: "updated", status: finalStatus, provider, detail };
}
