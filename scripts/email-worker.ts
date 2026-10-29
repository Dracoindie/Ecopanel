import { existsSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { getEmailConfig } from "@/lib/server/email/config";
import { getEmailProvider } from "@/lib/server/email/provider";
import {
  countEmailJobs,
  recoverExpiredEmailSending,
  runEmailWorkerOnce
} from "@/lib/server/email/outbox";
import { describeError, logError, logInfo, logWarn } from "@/lib/server/logger";
import { cleanupRateLimitBuckets } from "@/lib/server/rate-limit";

// Options: --env-file <path> loads that file instead of .env.local (e.g. .env.live.local);
// --message <EmailMessage id> sends only that queued message once, then exits.
function argValue(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith("--"))) throw new Error(`${name} needs a value.`);
  return value;
}
const envFile = argValue("--env-file");
const onlyMessageId = argValue("--message");

if (process.env.EMAIL_WORKER_SKIP_ENV_FILE !== "true") {
  if (envFile) {
    if (!existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);
    process.loadEnvFile(envFile);
  } else if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  else if (existsSync(".env")) process.loadEnvFile(".env");
}

const workerId = `${os.hostname()}-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
const pollMs = Math.max(250, Number(process.env.EMAIL_WORKER_POLL_MS) || 1_000);
const healthPort = Number(process.env.EMAIL_WORKER_HEALTH_PORT) || 0;
const maxJobs = Math.max(0, Number(process.env.EMAIL_WORKER_MAX_JOBS) || 0);
const cleanupIntervalMs = Math.max(60_000, Number(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS) || 5 * 60_000);
const recoveryIntervalMs = Math.max(10_000, Number(process.env.EMAIL_WORKER_RECOVERY_INTERVAL_MS) || 30_000);

let stopping = false;
let processed = 0;
let lastLoopAt = new Date().toISOString();
let lastError: string | null = null;
let lastCleanupAt = 0;
let lastRecoveryAt = 0;
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
        const jobs = await countEmailJobs(prisma);
        response.statusCode = stopping ? 503 : 200;
        response.end(JSON.stringify({ status: stopping ? "stopping" : "ready", jobs, lastLoopAt, lastError }));
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
  logInfo("Email delivery worker health server listening", { port: healthPort });
  return server;
}

async function loop() {
  const provider = getEmailProvider();
  const config = getEmailConfig();
  if (!provider) {
    logError("Email delivery is not configured. Set EMAIL_PROVIDER=resend, EMAIL_MODE, RESEND_API_KEY, and EMAIL_FROM.", {
      issue: config.configurationIssue
    });
    process.exitCode = 1;
    return;
  }

  logInfo("Email delivery worker ready", {
    workerId,
    provider: provider.name,
    mode: provider.mode
  });

  if (onlyMessageId) {
    const result = await runEmailWorkerOnce({ prisma, provider, workerId, messageId: onlyMessageId });
    if (!result) {
      logError("Message is not queued and due; nothing sent", { workerId, messageId: onlyMessageId });
      process.exitCode = 1;
      return;
    }
    processed = 1;
    logInfo("Email delivery job processed", {
      workerId,
      messageId: result.messageId,
      outcome: result.outcome,
      providerMessageId: result.providerMessageId,
      failureCode: result.failureCode
    });
    if (result.outcome !== "accepted") process.exitCode = 1;
    return;
  }

  while (!stopping) {
    lastLoopAt = new Date().toISOString();
    try {
      if (Date.now() - lastRecoveryAt >= recoveryIntervalMs) {
        lastRecoveryAt = Date.now();
        const recovered = await recoverExpiredEmailSending(prisma);
        if (recovered.recovered > 0) {
          logWarn("Expired email sends marked ambiguous", { workerId, recovered: recovered.recovered });
        }
      }
      if (Date.now() - lastCleanupAt >= cleanupIntervalMs) {
        lastCleanupAt = Date.now();
        const cleanup = await cleanupRateLimitBuckets(prisma);
        if (cleanup.deleted > 0) logInfo("Expired rate-limit buckets removed", { deleted: cleanup.deleted });
      }

      const result = await runEmailWorkerOnce({ prisma, provider, workerId });
      lastError = null;
      if (!result) {
        if (maxJobs && processed >= maxJobs) break;
        await sleep(pollMs);
        continue;
      }

      processed += 1;
      const fields = {
        workerId,
        messageId: result.messageId,
        attempts: result.attempts,
        outcome: result.outcome,
        failureCode: result.failureCode,
        retryInMs: result.delayMs
      };
      if (result.outcome === "failed" || result.outcome === "collision") {
        logWarn("Email delivery job needs attention", fields);
      } else {
        logInfo("Email delivery job processed", fields);
      }
      if (maxJobs && processed >= maxJobs) break;
    } catch (error) {
      lastError = describeError(error).message;
      logError("Email delivery worker loop failed", { workerId, error });
      await sleep(Math.max(2_000, pollMs));
    }
  }
}

async function main() {
  logInfo("Email delivery worker starting", { workerId, pollMs, maxJobs: maxJobs || "unlimited" });
  const healthServer = await startHealthServer();
  let forceExit: NodeJS.Timeout | null = null;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logInfo("Email delivery worker stopping", { workerId, signal, processed });
    healthServer?.close();
    forceExit = setTimeout(() => {
      logError("Email delivery worker did not stop within 30 seconds", { workerId });
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
  logInfo("Email delivery worker stopped", { workerId, processed });
}

main().catch(error => {
  logError("Email delivery worker failed to start", { workerId, error });
  process.exitCode = 1;
});
