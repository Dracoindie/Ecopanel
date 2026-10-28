import { NextResponse } from "next/server";
import { AppConfigurationError, isDatabaseMode } from "@/lib/server/config";
import { getHrContext, type HrContext } from "@/lib/server/session";
import { unauthorized } from "@/lib/server/http";
import { logError, requestIdFromRequest } from "@/lib/server/logger";

export async function getHrApiContext(request: Request): Promise<{ context: HrContext } | { response: NextResponse }> {
  if (!isDatabaseMode()) {
    return {
      response: NextResponse.json(
        { error: "This endpoint requires APP_DATA_MODE=database.", code: "DATABASE_MODE_REQUIRED" },
        { status: 503 }
      )
    };
  }
  try {
    const context = await getHrContext(request.headers);
    if (!context) return { response: unauthorized() };
    return { context };
  } catch (error) {
    return { response: apiErrorResponse(error, request) };
  }
}

export function apiErrorResponse(error: unknown, request?: Request) {
  if (error instanceof AppConfigurationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
  }
  if (error && typeof error === "object" && "status" in error && "code" in error) {
    const typed = error as { status: number; message: string; code: string };
    if (typeof typed.status === "number" && typed.status >= 400 && typed.status < 600) {
      return NextResponse.json({ error: typed.message, code: typed.code }, { status: typed.status });
    }
  }
  logError("API request failed", {
    requestId: request ? requestIdFromRequest(request) : undefined,
    route: request ? new URL(request.url).pathname : undefined,
    error
  });
  return NextResponse.json(
    { error: "The recruitment service is unavailable. No demo data was substituted.", code: "SERVICE_UNAVAILABLE" },
    { status: 503 }
  );
}
