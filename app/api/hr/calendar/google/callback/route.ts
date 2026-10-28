import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/server/config";
import { canManageOrganization, getHrContext } from "@/lib/server/session";
import { CalendarConfigurationError } from "@/lib/server/calendar/config";
import { CalendarOAuthError, completeGoogleOAuth } from "@/lib/server/calendar/oauth";
import { CalendarProviderError } from "@/lib/server/calendar/types";
import { logError } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

function scheduleRedirect(params: Record<string, string>) {
  const url = new URL("/hr/schedule", getAppUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

function loginRedirect() {
  const url = new URL("/hr/login", getAppUrl());
  url.searchParams.set("next", "/hr/schedule");
  return NextResponse.redirect(url);
}

function errorReason(error: unknown) {
  if (error instanceof CalendarConfigurationError) return "not_configured";
  if (error instanceof CalendarOAuthError) return "authorization_failed";
  if (error instanceof CalendarProviderError) return error.code.toLowerCase();
  return "sync_unavailable";
}

export async function GET(request: Request) {
  let context;
  try {
    context = await getHrContext(request.headers);
  } catch (error) {
    logError("Calendar callback could not resolve the HR session", { error });
    return scheduleRedirect({ calendar: "error", reason: "session_unavailable" });
  }
  if (!context) return loginRedirect();
  if (!canManageOrganization(context.role)) {
    return scheduleRedirect({ calendar: "error", reason: "forbidden" });
  }

  const url = new URL(request.url);
  try {
    await completeGoogleOAuth({
      context,
      state: url.searchParams.get("state"),
      code: url.searchParams.get("code"),
      oauthError: url.searchParams.get("error")
    });
    return scheduleRedirect({ calendar: "connected" });
  } catch (error) {
    if (!(error instanceof CalendarOAuthError) && !(error instanceof CalendarConfigurationError)) {
      logError("Google Calendar connection failed", {
        error,
        organizationId: context.organization.id
      });
    }
    return scheduleRedirect({ calendar: "error", reason: errorReason(error) });
  }
}
