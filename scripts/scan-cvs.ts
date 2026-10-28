import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { getCvScanner } from "@/lib/server/cv/scanner";
import { getCvStorage } from "@/lib/server/cv/storage";
import {
  countScanJobs,
  defaultScanLeaseMs,
  enqueueMissingScanJobs,
  requeueFailedScanJobs,
  runScanWorkerOnce
} from "@/lib/server/cv/scan-queue";
import { logError, logInfo } from "@/lib/server/logger";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  let scanner;
  try {
    scanner = getCvScanner();
  } catch {
    logError("CV scanner configuration is invalid. No files were scanned.");
    process.exitCode = 1;
    return;
  }
  if (!scanner) {
    logError("No CV scanner is configured. Set CV_SCANNER_PROVIDER=clamav or CV_SCANNER_PROVIDER=http. No files were scanned.");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  const workerId = `cv-retry-${process.pid}`;
  try {
    if (process.argv.includes("--requeue-failed")) {
      const requeued = await requeueFailedScanJobs(prisma);
      logInfo("Terminal CV scan jobs requeued", requeued);
    }
    const backfill = await enqueueMissingScanJobs(prisma);
    if (backfill.enqueued > 0) logInfo("Missing CV scan jobs enqueued", backfill);

    const limit = Math.max(1, Math.min(1_000, Number(process.env.CV_SCAN_RETRY_LIMIT) || 200));
    const outcomes: Record<string, number> = {};
    let attempted = 0;
    for (let index = 0; index < limit; index += 1) {
      const result = await runScanWorkerOnce({
        prisma,
        scanner,
        storage: getCvStorage(),
        workerId,
        leaseMs: defaultScanLeaseMs()
      });
      if (!result) break;
      attempted += 1;
      const key = `${result.outcome}${result.scanStatus ? `:${result.scanStatus}` : ""}`;
      outcomes[key] = (outcomes[key] ?? 0) + 1;
    }

    console.log(JSON.stringify({
      provider: scanner.name,
      backfill,
      attempted,
      outcomes,
      jobs: await countScanJobs(prisma)
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  logError("CV scan retry failed", { error });
  process.exitCode = 1;
});
