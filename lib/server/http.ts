import { NextResponse } from "next/server";
import { logError } from "@/lib/server/logger";
import {
  getRateLimitPolicy,
  getRateLimitSubject,
  getSharedRateLimiter,
  type RateLimitDecision,
  type RateLimitPolicyName
} from "@/lib/server/rate-limit";

export function rateLimitResponse(decision: Pick<RateLimitDecision, "resetAt" | "retryAfterSeconds">) {
  const retryAfter = Math.max(1, decision.retryAfterSeconds || Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests. Try again shortly.", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": "0",
        "Cache-Control": "no-store"
      }
    }
  );
}

export function rateLimitUnavailableResponse() {
  return NextResponse.json(
    { error: "Rate limiting is temporarily unavailable. The request was not processed.", code: "RATE_LIMIT_UNAVAILABLE" },
    { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } }
  );
}

/**
 * Shared, fail-closed rate limiting. Sensitive routes must not continue when
 * the shared limiter cannot be reached.
 */
export async function enforceRateLimit(
  request: Request,
  policyName: RateLimitPolicyName,
  options: { userId?: string | null } = {}
): Promise<{ decision: RateLimitDecision } | { response: NextResponse }> {
  const policy = getRateLimitPolicy(policyName);
  try {
    const decision = await getSharedRateLimiter().consume({
      scope: policy.scope,
      subject: getRateLimitSubject(request, options.userId),
      limit: policy.limit,
      windowMs: policy.windowMs
    });
    if (!decision.allowed) return { response: rateLimitResponse(decision) };
    return { decision };
  } catch (error) {
    logError("Shared rate-limit storage unavailable", {
      requestId: request.headers.get("x-request-id") ?? undefined,
      route: new URL(request.url).pathname,
      scope: policy.scope,
      error
    });
    return { response: rateLimitUnavailableResponse() };
  }
}

export function apiError(status: number, message: string, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export function unauthorized() {
  return apiError(401, "Sign in is required.", "UNAUTHORIZED");
}

export function forbidden() {
  return apiError(403, "You do not have access to this resource.", "FORBIDDEN");
}
