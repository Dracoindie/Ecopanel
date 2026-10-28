import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth";
import { isDatabaseMode } from "@/lib/server/config";
import { getPrisma } from "@/lib/server/db";
import { enforceRateLimit } from "@/lib/server/http";
import { logError } from "@/lib/server/logger";
import { authRateLimitPolicyName } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const handlers = toNextJsHandler(async request => {
  if (!isDatabaseMode()) {
    return Response.json(
      { error: "Authentication is available only when APP_DATA_MODE=database.", code: "AUTH_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  if (request.method !== "GET") {
    const rate = await enforceRateLimit(request, authRateLimitPolicyName(new URL(request.url).pathname));
    if ("response" in rate) return rate.response;
  }

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return await getAuth().handler(request);
  } catch (error) {
    logError("Authentication configuration or database is unavailable", {
      requestId: request.headers.get("x-request-id") ?? undefined,
      route: new URL(request.url).pathname,
      error
    });
    return Response.json(
      { error: "Authentication is temporarily unavailable. No demo account was substituted.", code: "AUTH_UNAVAILABLE" },
      { status: 503 }
    );
  }
});

export const { GET, POST } = handlers;
