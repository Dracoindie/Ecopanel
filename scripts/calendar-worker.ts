import { existsSync } from "node:fs";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { getCalendarConfig } from "@/lib/server/calendar/config";
import {
  newCalendarWorkerId,
  runLiveCalendarWorkerOnce
} from "@/lib/server/calendar/sync";
import { describeError, logError, logInfo, logWarn } from "@/lib/server/logger";

if (process.env.CALENDAR_WORKER_SKIP_ENV_FILE !== "true") {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  else if (existsSync(".env")) process.loadEnvFile(".env");
}

const workerId = newCalendarWorkerId();
const pollMs = Math.max(500, Number(process.env.CALENDAR_WORKER_POLL_MS) || 2_000);
const healthPort = Number(process.env.CALENDAR_WORKER_HEALTH_PORT) || 0;
const maxJobs = Math.max(0, Number(process.env.CALENDAR_WORKER_MAX_JOBS) || 0);
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
        const jobs = await prisma.calendarEvent.count({
          where: { status: { in: ["Pending", "Retrying", "Processing"] } }
        });
        response.statusCode = stopping ? 503 : 200;
        response.end(JSON.stringify({
          status: stopping ? "stopping" : "ready",
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
  logInfo("Calendar sync worker health server listening", { port: healthPort });
  return server;
}

async function loop() {
  const config = getCalendarConfig();
  if (!config.configured) {
    logError("Google Calendar is not configured for the calendar worker.", {
      issue: config.configurationIssue
    });
    process.exitCode = 1;
    return;
  }

  logInfo("Calendar sync worker ready", {
    workerId,
    provider: config.provider,
    pollMs
  });

  while (!stopping) {
    lastLoopAt = new Date().toISOString();
    try {
      const result = await runLiveCalendarWorkerOnce(workerId);
      lastError = null;
      if (!result.processed) {
        if (maxJobs && processed >= maxJobs) break;
        await sleep(pollMs);
        continue;
      }
      processed += 1;
      logInfo("Calendar sync job processed", {
        workerId,
        eventId: result.eventId
      });
      if (maxJobs && processed >= maxJobs) break;
    } catch (error) {
      lastError = describeError(error).message;
      logError("Calendar sync worker loop failed", { workerId, error });
      logWarn("Calendar worker will retry after a short delay", { workerId, pollMs });
      await sleep(Math.max(2_000, pollMs));
    }
  }
}

async function main() {
  logInfo("Calendar sync worker starting", {
    workerId,
    pollMs,
    maxJobs: maxJobs || "unlimited"
  });
  const healthServer = await startHealthServer();
  let forceExit: NodeJS.Timeout | null = null;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logInfo("Calendar sync worker stopping", { workerId, signal, processed });
    healthServer?.close();
    forceExit = setTimeout(() => {
      logError("Calendar sync worker did not stop within 30 seconds", { workerId });
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
  logInfo("Calendar sync worker stopped", { workerId, processed });
}

main().catch(error => {
  logError("Calendar sync worker failed to start", { workerId, error });
  process.exitCode = 1;
});
