import { existsSync } from "node:fs";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { getAssessmentConfig } from "@/lib/server/assessment/config";
import { getAssessmentProvider } from "@/lib/server/assessment/provider";
import {
  assessmentWorkerId,
  assessmentWorkerPollMs,
  processNextAssessmentJob
} from "@/lib/server/assessment/worker";
import { describeError, logError, logInfo, logWarn } from "@/lib/server/logger";

if (process.env.ASSESSMENT_WORKER_SKIP_ENV_FILE !== "true") {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  else if (existsSync(".env")) process.loadEnvFile(".env");
}

const workerId = assessmentWorkerId();
const pollMs = assessmentWorkerPollMs();
const healthPort = Number(process.env.ASSESSMENT_WORKER_HEALTH_PORT) || 0;
const maxJobs = Math.max(0, Number(process.env.ASSESSMENT_WORKER_MAX_JOBS) || 0);
const prisma = new PrismaClient();

let stopping = false;
let processed = 0;
let lastLoopAt = new Date().toISOString();
let lastError: string | null = null;

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
      response.end(JSON.stringify({
        status: "ok",
        workerId,
        processed,
        uptimeSeconds: Math.round(process.uptime())
      }));
      return;
    }
    if (url === "/ready" || url === "/readyz") {
      try {
        await prisma.$queryRaw`SELECT 1`;
        const jobs = await prisma.assessmentJob.count({
          where: { status: { in: ["Pending", "Retrying", "Processing"] } }
        });
        const config = getAssessmentConfig();
        response.statusCode = stopping || !config.configured ? 503 : 200;
        response.end(JSON.stringify({
          status: stopping ? "stopping" : config.configured ? "ready" : "unconfigured",
          provider: config.provider ?? "disabled",
          jobs,
          lastLoopAt,
          lastError
        }));
      } catch {
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
  logInfo("Assessment worker health server listening", { port: healthPort });
  return server;
}

async function loop() {
  const config = getAssessmentConfig();
  const provider = getAssessmentProvider();
  if (!provider) {
    logError("Assessment provider is not configured. Set ASSESSMENT_PROVIDER=openai, OPENAI_API_KEY, and OPENAI_ASSESSMENT_MODEL.", {
      issue: config.configurationIssue
    });
    process.exitCode = 1;
    return;
  }

  logInfo("Assessment worker ready", {
    workerId,
    provider: provider.name,
    model: provider.model,
    pollMs
  });

  while (!stopping) {
    lastLoopAt = new Date().toISOString();
    try {
      const result = await processNextAssessmentJob(prisma, { workerId, provider });
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
        outcome: result.outcome,
        status: result.status,
        failureCode: result.failureCode,
        retryInMs: result.delayMs,
        assessmentId: result.assessmentId
      };
      if (result.outcome === "failed" || result.outcome === "collision") {
        logWarn("Assessment job needs attention", fields);
      } else {
        logInfo("Assessment job processed", fields);
      }
      if (maxJobs && processed >= maxJobs) break;
    } catch (error) {
      lastError = describeError(error).message;
      logError("Assessment worker loop failed", { workerId, error });
      await sleep(Math.max(2_000, pollMs));
    }
  }
}

async function main() {
  logInfo("Assessment worker starting", { workerId, pollMs, maxJobs: maxJobs || "unlimited" });
  const healthServer = await startHealthServer();
  let forceExit: NodeJS.Timeout | null = null;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logInfo("Assessment worker stopping", { workerId, signal, processed });
    healthServer?.close();
    forceExit = setTimeout(() => {
      logError("Assessment worker did not stop within 30 seconds", { workerId });
      process.exit(1);
    }, 30_000);
    forceExit.unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    await loop();
  } finally {
    if (forceExit) clearTimeout(forceExit);
    healthServer?.close();
    await prisma.$disconnect();
  }
  logInfo("Assessment worker stopped", { workerId, processed });
}

main().catch(error => {
  logError("Assessment worker failed to start", { workerId, error });
  process.exitCode = 1;
});
