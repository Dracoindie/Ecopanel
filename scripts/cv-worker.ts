import { existsSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { cleanupRateLimitBuckets } from "@/lib/server/rate-limit";
import { getCvScanner } from "@/lib/server/cv/scanner";
import { getCvStorage } from "@/lib/server/cv/storage";
import {
  countScanJobs,
  defaultScanLeaseMs,
  enqueueMissingScanJobs,
  runScanWorkerOnce
} from "@/lib/server/cv/scan-queue";
import { describeError, logError, logInfo, logWarn } from "@/lib/server/logger";

// Options: --env-file <path> loads that file instead of .env.local (e.g. .env.live.local);
// --job <CvScanJob id> scans only that job once, then exits.
function argValue(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith("--"))) throw new Error(`${name} needs a value.`);
  return value;
}
const envFile = argValue("--env-file");
const onlyJobId = argValue("--job");

if (process.env.CV_WORKER_SKIP_ENV_FILE !== "true") {
  if (envFile) {
    if (!existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);
    process.loadEnvFile(envFile);
  } else if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  else if (existsSync(".env")) process.loadEnvFile(".env");
}

const workerId = `${os.hostname()}-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
const pollMs = Math.max(250, Number(process.env.CV_WORKER_POLL_MS) || 1_000);
const healthPort = Number(process.env.CV_WORKER_HEALTH_PORT) || 0;
const maxJobs = Math.max(0, Number(process.env.CV_WORKER_MAX_JOBS) || 0);
const cleanupIntervalMs = Math.max(60_000, Number(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS) || 5 * 60_000);

let stopping = false;
let processed = 0;
let lastLoopAt = new Date().toISOString();
let lastError: string | null = null;
let lastCleanupAt = 0;
const prisma = new PrismaClient();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startHealthServer() {
  if (!healthPort) return null;
  const server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    const url = request.url ?? "/";
    if (url === "/health" || url === "/live" || url === "/healthz") {
      response.statusCode = 200;
      response.end(JSON.stringify({ status: "ok", workerId, processed, uptimeSeconds: Math.round(process.uptime()) }));
      return;
    }
    if (url === "/ready" || url === "/readyz") {
      try {
        await prisma.$queryRaw`SELECT 1`;
        const jobs = await countScanJobs(prisma);
        response.statusCode = stopping ? 503 : 200;
        response.end(JSON.stringify({ status: stopping ? "stopping" : "ready", jobs, lastLoopAt, lastError }));
      } catch (error) {
        response.statusCode = 503;
        response.end(JSON.stringify({ status: "unavailable", reason: "database", lastLoopAt }));
      }
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Not found" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(healthPort, "127.0.0.1", resolve);
  });
  logInfo("CV scan worker health server listening", { port: healthPort });
  return server;
}

async function loop() {
  const scanner = getCvScanner();
  if (!scanner) {
    logError("No CV scanner is configured. Set CV_SCANNER_PROVIDER=clamav or CV_SCANNER_PROVIDER=http.");
    process.exitCode = 1;
    return;
  }

  try {
    const backfill = await enqueueMissingScanJobs(prisma);
    if (backfill.enqueued > 0) logInfo("Missing CV scan jobs enqueued at startup", backfill);
  } catch (error) {
    logWarn("Could not backfill missing CV scan jobs at startup", { workerId, error });
  }

  if (onlyJobId) {
    const result = await runScanWorkerOnce({ prisma, scanner, storage: getCvStorage(), workerId, leaseMs: defaultScanLeaseMs(), jobId: onlyJobId });
    if (!result) {
      logError("CV scan job is not due; nothing scanned", { workerId, jobId: onlyJobId });
      process.exitCode = 1;
      return;
    }
    processed = 1;
    logInfo("CV scan job processed", { workerId, jobId: result.jobId, cvFileId: result.cvFileId, outcome: result.outcome, scanStatus: result.scanStatus, error: result.error });
    if (result.outcome === "failed" || result.outcome === "collision") process.exitCode = 1;
    return;
  }

  while (!stopping) {
    lastLoopAt = new Date().toISOString();
    try {
      if (Date.now() - lastCleanupAt >= cleanupIntervalMs) {
        lastCleanupAt = Date.now();
        const cleanup = await cleanupRateLimitBuckets(prisma);
        if (cleanup.deleted > 0) logInfo("Expired rate-limit buckets removed", { deleted: cleanup.deleted });
        const backfill = await enqueueMissingScanJobs(prisma);
        if (backfill.enqueued > 0) logInfo("Missing CV scan jobs enqueued", backfill);
      }

      const result = await runScanWorkerOnce({
        prisma,
        scanner,
        storage: getCvStorage(),
        workerId,
        leaseMs: defaultScanLeaseMs()
      });
      lastError = null;

      if (!result) {
        if (maxJobs && processed >= maxJobs) break;
        await sleep(pollMs);
        continue;
      }

      processed += 1;
      const fields = {
        workerId,
        jobId: result.jobId,
        cvFileId: result.cvFileId,
        attempts: result.attempts,
        outcome: result.outcome,
        scanStatus: result.scanStatus,
        retryInMs: result.delayMs,
        error: result.error
      };
      if (result.outcome === "failed" || result.outcome === "collision") logWarn("CV scan job needs attention", fields);
      else logInfo("CV scan job processed", fields);

      if (maxJobs && processed >= maxJobs) break;
    } catch (error) {
      lastError = describeError(error).message;
      logError("CV scan worker loop failed", { workerId, error });
      await sleep(Math.max(2_000, pollMs));
    }
  }
}

async function main() {
  logInfo("CV scan worker starting", { workerId, pollMs, maxJobs: maxJobs || "unlimited" });
  const healthServer = await startHealthServer();

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logInfo("CV scan worker stopping", { workerId, signal, processed });
    setTimeout(() => {
      healthServer?.close();
      prisma.$disconnect().finally(() => process.exit(0));
    }, 250).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    await loop();
  } finally {
    healthServer?.close();
    await prisma.$disconnect();
  }
  logInfo("CV scan worker stopped", { workerId, processed });
}

main().catch(error => {
  logError("CV scan worker failed to start", { workerId, error });
  process.exitCode = 1;
});
