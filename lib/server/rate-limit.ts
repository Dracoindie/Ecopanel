import { createHmac } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AppConfigurationError, getAuthSecret } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";

export class RateLimitUnavailableError extends Error {
  readonly code = "RATE_LIMIT_UNAVAILABLE";

  constructor(message = "Shared rate-limit storage is unavailable.") {
    super(message);
    this.name = "RateLimitUnavailableError";
  }
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export interface RateLimitRequest {
  scope: string;
  subject: string;
  limit: number;
  windowMs: number;
  now?: Date;
}

export interface SharedRateLimiter {
  consume(input: RateLimitRequest): Promise<RateLimitDecision>;
}

export type RateLimitPolicyName =
  | "authSignIn"
  | "authPasswordReset"
  | "authOther"
  | "publicApply"
  | "applicationStatus"
  | "cvDownload"
  | "hrRead"
  | "hrMutation"
  | "emailSend"
  | "emailWebhook"
  | "interviewSession"
  | "interviewToken"
  | "interviewStart"
  | "interviewStop"
  | "interviewMutation"
  | "candidateRedeem";

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

function envLimit(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(100_000, Math.floor(raw)));
}

export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitPolicy {
  switch (name) {
    case "authSignIn":
      return { scope: "auth-signin", limit: envLimit("RATE_LIMIT_AUTH_SIGNIN_MAX", 10), windowMs: MINUTE };
    case "authPasswordReset":
      return { scope: "auth-password-reset", limit: envLimit("RATE_LIMIT_AUTH_RESET_MAX", 5), windowMs: MINUTE };
    case "authOther":
      return { scope: "auth-other", limit: envLimit("RATE_LIMIT_AUTH_OTHER_MAX", 30), windowMs: MINUTE };
    case "publicApply":
      return { scope: "public-apply", limit: envLimit("RATE_LIMIT_PUBLIC_APPLY_MAX", 8), windowMs: MINUTE };
    case "applicationStatus":
      return { scope: "application-status", limit: envLimit("RATE_LIMIT_APPLICATION_STATUS_MAX", 30), windowMs: MINUTE };
    case "cvDownload":
      return { scope: "cv-download", limit: envLimit("RATE_LIMIT_CV_DOWNLOAD_MAX", 60), windowMs: MINUTE };
    case "hrRead":
      return { scope: "hr-read", limit: envLimit("RATE_LIMIT_HR_READ_MAX", 120), windowMs: MINUTE };
    case "hrMutation":
      return { scope: "hr-mutation", limit: envLimit("RATE_LIMIT_HR_MUTATION_MAX", 60), windowMs: MINUTE };
    case "emailSend":
      return { scope: "email-send", limit: envLimit("RATE_LIMIT_EMAIL_SEND_MAX", 30), windowMs: MINUTE };
    case "emailWebhook":
      return { scope: "email-webhook", limit: envLimit("RATE_LIMIT_EMAIL_WEBHOOK_MAX", 600), windowMs: MINUTE };
    case "interviewSession":
      return { scope: "interview-session", limit: envLimit("RATE_LIMIT_INTERVIEW_SESSION_MAX", 60), windowMs: MINUTE };
    case "interviewToken":
      return { scope: "interview-token", limit: envLimit("RATE_LIMIT_INTERVIEW_TOKEN_MAX", 20), windowMs: MINUTE };
    case "interviewStart":
      return { scope: "interview-start", limit: envLimit("RATE_LIMIT_INTERVIEW_START_MAX", 10), windowMs: MINUTE };
    case "interviewStop":
      return { scope: "interview-stop", limit: envLimit("RATE_LIMIT_INTERVIEW_STOP_MAX", 20), windowMs: MINUTE };
    case "interviewMutation":
      return { scope: "interview-mutation", limit: envLimit("RATE_LIMIT_INTERVIEW_MUTATION_MAX", 60), windowMs: MINUTE };
    case "candidateRedeem":
      return { scope: "candidate-redeem", limit: envLimit("RATE_LIMIT_CANDIDATE_REDEEM_MAX", 10), windowMs: MINUTE };
  }
}

export function authRateLimitPolicyName(pathname: string): RateLimitPolicyName {
  if (pathname.startsWith("/api/auth/sign-in")) return "authSignIn";
  if (pathname.startsWith("/api/auth/forget-password") || pathname.startsWith("/api/auth/request-password-reset")) {
    return "authPasswordReset";
  }
  return "authOther";
}

export function getRateLimitSecret() {
  const configured = process.env.RATE_LIMIT_SECRET?.trim();
  if (configured && configured.length >= 16) return configured;
  try {
    return getAuthSecret();
  } catch {
    if (process.env.NODE_ENV !== "production") return "ecopanel-local-rate-limit-secret";
    throw new AppConfigurationError("RATE_LIMIT_SECRET or AUTH_SECRET is required for shared rate limiting.");
  }
}

export function hashRateLimitSubject(subject: string, secret = getRateLimitSecret()) {
  return createHmac("sha256", secret).update(subject).digest("hex");
}

export function rateLimitBucketKey(scope: string, subject: string, secret = getRateLimitSecret()) {
  if (!/^[a-z0-9-]{2,64}$/.test(scope)) throw new Error("Invalid rate-limit scope.");
  return `${scope}:${hashRateLimitSubject(subject, secret)}`;
}

function trustedProxyHeaders() {
  return process.env.TRUSTED_PROXY_HEADERS === "true" || process.env.RATE_LIMIT_TRUST_PROXY === "true";
}

/**
 * Returns a coarse client identity for public routes. Forwarded IP headers are
 * only trusted when the deployment explicitly declares a trusted proxy.
 */
export function getClientIdentity(request: Request) {
  if (trustedProxyHeaders()) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return `ip:${forwarded.slice(0, 120)}`;
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return `ip:${realIp.slice(0, 120)}`;
  }
  const userAgent = request.headers.get("user-agent")?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return userAgent ? `ua:${userAgent.slice(0, 240)}` : "anonymous";
}

export function getRateLimitSubject(request: Request, userId?: string | null) {
  return userId ? `user:${userId}` : `client:${getClientIdentity(request)}`;
}

export function createSharedRateLimiter(prisma: PrismaClient, secret = getRateLimitSecret()): SharedRateLimiter {
  return {
    async consume(input) {
      const now = input.now ?? new Date();
      const windowMs = Math.max(1_000, Math.min(24 * 60 * 60 * 1_000, Math.floor(input.windowMs)));
      const limit = Math.max(1, Math.floor(input.limit));
      const expiresAt = new Date(now.getTime() + windowMs);
      const key = rateLimitBucketKey(input.scope, input.subject, secret);

      try {
        const rows = await prisma.$queryRaw<Array<{ count: number | bigint; expiresAt: Date }>>(Prisma.sql`
          INSERT INTO "RateLimitBucket" ("key", "scope", "count", "windowStart", "expiresAt", "updatedAt")
          VALUES (${key}, ${input.scope}, 1, ${now}, ${expiresAt}, ${now})
          ON CONFLICT ("key") DO UPDATE SET
            "scope" = ${input.scope},
            "count" = CASE
              WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1
              ELSE LEAST("RateLimitBucket"."count" + 1, ${limit + 1})
            END,
            "windowStart" = CASE
              WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${now}
              ELSE "RateLimitBucket"."windowStart"
            END,
            "expiresAt" = CASE
              WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expiresAt}
              ELSE "RateLimitBucket"."expiresAt"
            END,
            "updatedAt" = ${now}
          RETURNING "count", "expiresAt"
        `);
        const row = rows[0];
        if (!row) throw new Error("Rate-limit storage returned no row.");
        const count = Number(row.count);
        const resetAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
        const allowed = count <= limit;
        return {
          allowed,
          limit,
          remaining: Math.max(0, limit - count),
          resetAt,
          retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))
        };
      } catch (error) {
        if (error instanceof RateLimitUnavailableError) throw error;
        throw new RateLimitUnavailableError(
          error instanceof Error && /RateLimitBucket|does not exist/i.test(error.message)
            ? "Shared rate-limit storage is not migrated."
            : "Shared rate-limit storage is unavailable."
        );
      }
    }
  };
}

let sharedLimiter: SharedRateLimiter | null = null;

export function getSharedRateLimiter() {
  if (!sharedLimiter) {
    sharedLimiter = createSharedRateLimiter(getPrisma());
  }
  return sharedLimiter;
}

export function resetSharedRateLimiterCache() {
  sharedLimiter = null;
}

export async function cleanupRateLimitBuckets(prisma: PrismaClient, now = new Date()) {
  const retentionHours = Math.max(1, Number(process.env.RATE_LIMIT_RETENTION_HOURS) || 1);
  const cutoff = new Date(now.getTime() - retentionHours * 60 * 60 * 1_000);
  const result = await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return { deleted: result.count, cutoff };
}
