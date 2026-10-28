import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { getCvStorageDir, isDatabaseMode } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { checkCvScannerHealth, type CvScannerHealth } from "@/lib/server/cv/scanner";
import { logWarn } from "@/lib/server/logger";

export type HealthState = "ok" | "degraded" | "unavailable" | "disabled";

export interface HealthCheck {
  status: HealthState;
  required: boolean;
}

export interface ReadinessResult {
  status: "ready" | "degraded" | "unavailable";
  httpStatus: 200 | 503;
  checks: {
    database: HealthCheck;
    cvStorage: HealthCheck;
    scanner: HealthCheck & { provider?: string | null };
  };
}

export interface ReadinessDependencies {
  databaseMode: boolean;
  checkDatabase: () => Promise<boolean>;
  checkStorage: () => Promise<boolean>;
  checkScanner: () => Promise<CvScannerHealth>;
}

async function databaseReachable() {
  await getPrisma().$queryRaw`SELECT 1`;
  return true;
}

async function storageWritable() {
  const root = path.resolve(process.cwd(), getCvStorageDir());
  await mkdir(root, { recursive: true, mode: 0o700 });
  await access(root);
  return true;
}

export const defaultReadinessDependencies: ReadinessDependencies = {
  get databaseMode() {
    return isDatabaseMode();
  },
  checkDatabase: databaseReachable,
  checkStorage: storageWritable,
  checkScanner: () => checkCvScannerHealth()
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs))
  ]);
}

export async function checkReadiness(dependencies: ReadinessDependencies = defaultReadinessDependencies): Promise<ReadinessResult> {
  const databaseMode = dependencies.databaseMode;

  let database: HealthCheck;
  if (!databaseMode) {
    database = { status: "disabled", required: false };
  } else {
    let ok = false;
    try {
      ok = await withTimeout(dependencies.checkDatabase(), 3_000, false);
    } catch {
      ok = false;
    }
    if (!ok) logWarn("Readiness check failed: database unavailable");
    database = { status: ok ? "ok" : "unavailable", required: true };
  }

  let cvStorage: HealthCheck;
  if (!databaseMode) {
    cvStorage = { status: "disabled", required: false };
  } else {
    let ok = false;
    try {
      ok = await withTimeout(dependencies.checkStorage(), 3_000, false);
    } catch {
      ok = false;
    }
    if (!ok) logWarn("Readiness check failed: private CV storage unavailable");
    cvStorage = { status: ok ? "ok" : "unavailable", required: true };
  }

  let scanner: ReadinessResult["checks"]["scanner"];
  try {
    const health = await withTimeout(dependencies.checkScanner(), 3_000, {
      configured: true,
      provider: null,
      reachable: false
    });
    if (!health.configured) scanner = { status: "disabled", required: false, provider: null };
    else if (health.reachable) scanner = { status: "ok", required: false, provider: health.provider };
    else scanner = { status: "degraded", required: false, provider: health.provider };
  } catch {
    scanner = { status: "degraded", required: false, provider: null };
  }

  const requiredFailure = [database, cvStorage].some(check => check.required && check.status === "unavailable");
  const degraded = [database, cvStorage, scanner].some(check => check.status === "degraded" || (!check.required && check.status === "unavailable"));

  return {
    status: requiredFailure ? "unavailable" : degraded ? "degraded" : "ready",
    httpStatus: requiredFailure ? 503 : 200,
    checks: { database, cvStorage, scanner }
  };
}
