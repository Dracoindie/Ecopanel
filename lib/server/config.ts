import { logError } from "@/lib/server/logger";

export type AppDataMode = "demo" | "database";

export class AppConfigurationError extends Error {
  readonly code = "APP_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AppConfigurationError";
  }
}

export function getDataMode(): AppDataMode {
  const value = process.env.APP_DATA_MODE?.trim().toLowerCase();
  if (value === "database" || value === "production" || value === "prod") return "database";
  return "demo";
}

export function isDatabaseMode() {
  return getDataMode() === "database";
}

/**
 * Public base URL as configured at request time. Next.js inlines NEXT_PUBLIC_*
 * values into the build, so APP_PUBLIC_URL (read at runtime) takes precedence:
 * a new tunnel address then needs only a restart, not a rebuild.
 */
export function configuredAppUrl(): string | undefined {
  return process.env.APP_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || undefined;
}

export function getAppUrl() {
  return configuredAppUrl() || "http://localhost:3000";
}

export function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new AppConfigurationError("AUTH_SECRET must be configured with at least 32 characters for database mode.");
  }
  return secret;
}

export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new AppConfigurationError("DATABASE_URL is required when APP_DATA_MODE=database.");
  }
  return url;
}

export function assertDatabaseConfigured() {
  if (!isDatabaseMode()) {
    throw new AppConfigurationError("Database mode is not enabled. Set APP_DATA_MODE=database.");
  }
  getDatabaseUrl();
  getAuthSecret();
}

export function getCvStorageDir() {
  return process.env.CV_STORAGE_DIR?.trim() || "var/cv-storage";
}

export function allowUnscannedCvDownloads() {
  return process.env.CV_ALLOW_UNSCANNED_DOWNLOADS === "true" && process.env.NODE_ENV !== "production";
}

export function isDemoInterviewAccessExplicitlyAllowed() {
  if (process.env.NODE_ENV === "production") return false;
  if (getDataMode() === "demo") return true;
  return process.env.ALLOW_UNAUTHENTICATED_DEMO_INTERVIEWS === "true";
}

export function databaseErrorResponse(error: unknown) {
  if (error instanceof AppConfigurationError) {
    return { status: 503, message: error.message, code: error.code };
  }
  logError("Database operation failed", { error });
  return { status: 503, message: "The recruitment database is unavailable. No demo data was substituted.", code: "DATABASE_UNAVAILABLE" };
}
