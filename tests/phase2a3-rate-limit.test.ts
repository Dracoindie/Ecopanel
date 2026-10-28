import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  RateLimitUnavailableError,
  authRateLimitPolicyName,
  cleanupRateLimitBuckets,
  createSharedRateLimiter,
  getClientIdentity,
  getRateLimitPolicy,
  getRateLimitSubject,
  hashRateLimitSubject,
  rateLimitBucketKey
} from "@/lib/server/rate-limit";
import { rateLimitResponse } from "@/lib/server/http";

const testUrl = process.env.TEST_DATABASE_URL;

describe("shared rate-limit policy and identity", () => {
  const original = { ...process.env };

  afterEach(() => {
    for (const key of ["RATE_LIMIT_PUBLIC_APPLY_MAX", "TRUSTED_PROXY_HEADERS", "RATE_LIMIT_TRUST_PROXY"]) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("uses conservative defaults and environment overrides", () => {
    delete process.env.RATE_LIMIT_PUBLIC_APPLY_MAX;
    expect(getRateLimitPolicy("publicApply")).toMatchObject({ scope: "public-apply", limit: 8 });
    process.env.RATE_LIMIT_PUBLIC_APPLY_MAX = "25";
    expect(getRateLimitPolicy("publicApply").limit).toBe(25);
    process.env.RATE_LIMIT_PUBLIC_APPLY_MAX = "not-a-number";
    expect(getRateLimitPolicy("publicApply").limit).toBe(8);
  });

  it("maps auth endpoints to dedicated policies", () => {
    expect(authRateLimitPolicyName("/api/auth/sign-in/email")).toBe("authSignIn");
    expect(authRateLimitPolicyName("/api/auth/forget-password")).toBe("authPasswordReset");
    expect(authRateLimitPolicyName("/api/auth/request-password-reset")).toBe("authPasswordReset");
    expect(authRateLimitPolicyName("/api/auth/session")).toBe("authOther");
  });

  it("hashes subjects and never embeds the raw subject in the bucket key", () => {
    const subject = "user:person@example.com";
    const key = rateLimitBucketKey("public-apply", subject, "test-secret-value-1234567890");
    expect(key.startsWith("public-apply:")).toBe(true);
    expect(key).not.toContain("person@example.com");
    expect(key).toBe(`public-apply:${hashRateLimitSubject(subject, "test-secret-value-1234567890")}`);
  });

  it("only trusts proxy headers when explicitly enabled", () => {
    delete process.env.TRUSTED_PROXY_HEADERS;
    delete process.env.RATE_LIMIT_TRUST_PROXY;
    const request = new Request("http://localhost/api/careers/applications", {
      headers: {
        "user-agent": "Vitest Browser",
        "x-forwarded-for": "203.0.113.9, 10.0.0.1"
      }
    });
    expect(getClientIdentity(request)).toBe("ua:Vitest Browser");
    process.env.TRUSTED_PROXY_HEADERS = "true";
    expect(getClientIdentity(request)).toBe("ip:203.0.113.9");
    expect(getRateLimitSubject(request, "user-1")).toBe("user:user-1");
  });

  it("returns a safe 429 response", async () => {
    const response = rateLimitResponse({ resetAt: new Date(Date.now() + 30_000), retryAfterSeconds: 12 });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("fails closed when shared storage is unavailable", async () => {
    const limiter = createSharedRateLimiter(
      {
        $queryRaw: async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
        }
      } as unknown as PrismaClient,
      "test-secret-value-1234567890"
    );
    await expect(limiter.consume({
      scope: "public-apply",
      subject: "ip:203.0.113.9",
      limit: 5,
      windowMs: 60_000
    })).rejects.toMatchObject({ code: "RATE_LIMIT_UNAVAILABLE" });

    const missingTable = createSharedRateLimiter(
      {
        $queryRaw: async () => {
          throw new Error('relation "RateLimitBucket" does not exist');
        }
      } as unknown as PrismaClient,
      "test-secret-value-1234567890"
    );
    await expect(missingTable.consume({
      scope: "public-apply",
      subject: "ip:203.0.113.9",
      limit: 5,
      windowMs: 60_000
    })).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});

const suite = testUrl ? describe : describe.skip;

suite("shared rate-limit storage (TEST_DATABASE_URL)", () => {
  let prisma: PrismaClient;
  let scope: string;
  let suffix: string;

  beforeAll(async () => {
    process.env.APP_DATA_MODE = "database";
    process.env.DATABASE_URL = testUrl;
    process.env.AUTH_SECRET = "integration-test-secret-value-1234567890";
    prisma = (await import("@/lib/server/db")).getPrisma();
    suffix = randomUUID().slice(0, 8);
    scope = `rl-test-${suffix}`;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.rateLimitBucket.deleteMany({ where: { scope: { startsWith: `rl-test-${suffix}` } } });
    await prisma.$disconnect();
  });

  it("enforces a shared fixed window across callers", async () => {
    const limiter = createSharedRateLimiter(prisma, "test-secret-value-1234567890");
    const now = new Date("2026-01-01T00:00:00.000Z");
    const results = await Promise.all(Array.from({ length: 12 }, () => limiter.consume({
      scope,
      subject: "ip:198.51.100.4",
      limit: 3,
      windowMs: 60_000,
      now
    })));
    expect(results.filter(result => result.allowed)).toHaveLength(3);
    expect(results.filter(result => !result.allowed)).toHaveLength(9);
    expect(results.find(result => !result.allowed)?.retryAfterSeconds).toBeGreaterThan(0);

    const buckets = await prisma.rateLimitBucket.findMany({ where: { scope } });
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(4);
    expect(buckets[0].key).toBe(rateLimitBucketKey(scope, "ip:198.51.100.4", "test-secret-value-1234567890"));
  });

  it("isolates subjects and resets after the window expires", async () => {
    const limiter = createSharedRateLimiter(prisma, "test-secret-value-1234567890");
    const start = new Date("2026-01-01T00:05:00.000Z");
    const first = await limiter.consume({ scope, subject: "ua:alpha", limit: 1, windowMs: 60_000, now: start });
    const other = await limiter.consume({ scope, subject: "ua:beta", limit: 1, windowMs: 60_000, now: start });
    expect(first.allowed).toBe(true);
    expect(other.allowed).toBe(true);

    const stillBlocked = await limiter.consume({
      scope,
      subject: "ua:alpha",
      limit: 1,
      windowMs: 60_000,
      now: new Date(start.getTime() + 30_000)
    });
    expect(stillBlocked.allowed).toBe(false);

    const reset = await limiter.consume({
      scope,
      subject: "ua:alpha",
      limit: 1,
      windowMs: 60_000,
      now: new Date(start.getTime() + 61_000)
    });
    expect(reset.allowed).toBe(true);
    expect(reset.remaining).toBe(0);
  });

  it("removes expired buckets without touching active ones", async () => {
    const now = new Date("2026-01-01T02:00:00.000Z");
    const expiredKey = rateLimitBucketKey(`${scope}-cleanup`, "expired", "test-secret-value-1234567890");
    const activeKey = rateLimitBucketKey(`${scope}-cleanup`, "active", "test-secret-value-1234567890");
    await prisma.rateLimitBucket.createMany({
      data: [
        {
          key: expiredKey,
          scope: `${scope}-cleanup`,
          count: 1,
          windowStart: new Date(now.getTime() - 4 * 60 * 60_000),
          expiresAt: new Date(now.getTime() - 3 * 60 * 60_000),
          updatedAt: new Date(now.getTime() - 4 * 60 * 60_000)
        },
        {
          key: activeKey,
          scope: `${scope}-cleanup`,
          count: 1,
          windowStart: now,
          expiresAt: new Date(now.getTime() + 60_000),
          updatedAt: now
        }
      ]
    });
    const result = await cleanupRateLimitBuckets(prisma, now);
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: expiredKey } })).toBeNull();
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: activeKey } })).not.toBeNull();
    await prisma.rateLimitBucket.deleteMany({ where: { scope: `${scope}-cleanup` } });
  });
});
