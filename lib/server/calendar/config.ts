import { getAppUrl } from "@/lib/server/config";
import { getCalendarEncryptionStatus } from "@/lib/server/calendar/crypto";

export const GOOGLE_CALENDAR_SCOPE = "openid email https://www.googleapis.com/auth/calendar.events";

export class CalendarConfigurationError extends Error {
  readonly code = "CALENDAR_CONFIGURATION_ERROR";
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = "CalendarConfigurationError";
  }
}

export interface CalendarConfig {
  provider: "google" | null;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  scope: string;
  configured: boolean;
  configurationIssue: string | null;
  timeoutMs: number;
  maxAttempts: number;
  leaseMs: number;
}

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function getCalendarRedirectUri() {
  const configured = clean(process.env.GOOGLE_CALENDAR_REDIRECT_URI);
  if (configured) return configured;
  return new URL("/api/hr/calendar/google/callback", getAppUrl()).toString();
}

export function getCalendarConfig(): CalendarConfig {
  const providerRaw = clean(process.env.CALENDAR_PROVIDER)?.toLowerCase() ?? "disabled";
  const provider = providerRaw === "google" ? "google" : null;
  const clientId = provider ? clean(process.env.GOOGLE_CALENDAR_CLIENT_ID) : null;
  const clientSecret = provider ? clean(process.env.GOOGLE_CALENDAR_CLIENT_SECRET) : null;
  const redirectUri = provider ? getCalendarRedirectUri() : null;
  const encryption = getCalendarEncryptionStatus();

  let configurationIssue: string | null = null;
  if (providerRaw !== "disabled" && providerRaw !== "google") {
    configurationIssue = "CALENDAR_PROVIDER must be google or disabled.";
  } else if (!provider) {
    configurationIssue = "CALENDAR_PROVIDER is disabled.";
  } else if (!clientId) {
    configurationIssue = "GOOGLE_CALENDAR_CLIENT_ID is not configured.";
  } else if (!clientSecret) {
    configurationIssue = "GOOGLE_CALENDAR_CLIENT_SECRET is not configured.";
  } else if (!redirectUri || !/^https?:\/\//i.test(redirectUri)) {
    configurationIssue = "GOOGLE_CALENDAR_REDIRECT_URI must be an absolute URL.";
  } else if (process.env.NODE_ENV === "production" && !redirectUri.startsWith("https://")) {
    configurationIssue = "GOOGLE_CALENDAR_REDIRECT_URI must use HTTPS in production.";
  } else if (!encryption.configured) {
    configurationIssue = encryption.issue;
  }

  const timeoutMs = boundedNumber(process.env.CALENDAR_SYNC_TIMEOUT_MS, 15_000, 2_000, 120_000);
  const configuredLeaseMs = boundedNumber(process.env.CALENDAR_SYNC_LEASE_MS, 120_000, 30_000, 900_000);
  return {
    provider,
    clientId,
    clientSecret,
    redirectUri,
    scope: GOOGLE_CALENDAR_SCOPE,
    configured: Boolean(provider && clientId && clientSecret && redirectUri && encryption.configured && !configurationIssue),
    configurationIssue,
    timeoutMs,
    maxAttempts: boundedNumber(process.env.CALENDAR_SYNC_MAX_ATTEMPTS, 5, 1, 20),
    leaseMs: Math.min(900_000, Math.max(configuredLeaseMs, timeoutMs + 30_000))
  };
}

export function requireCalendarConfig() {
  const config = getCalendarConfig();
  if (!config.configured || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new CalendarConfigurationError(config.configurationIssue || "Google Calendar is not configured.");
  }
  return config as CalendarConfig & {
    provider: "google";
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}
